"""Build deterministic, Power BI-ready descriptive summaries from the loan CSV.

This script is offline: it reads output/loan_analysis_extract.csv and never
connects to MariaDB. Grouped outcome summaries are descriptive only; they are
not predictor features and must not be joined into a model feature table.
Run from projects/financial-analytics:
    python python/build_analytics.py
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

REQUIRED_COLUMNS = {"loan_id", "account_id", "date", "amount", "duration", "status"}
SUMMARY_COLUMNS = (
    "duration_months", "status", "loan_count", "distinct_accounts",
    "average_loan_amount", "share_pct",
)
VINTAGE_COLUMNS = (
    "loan_month", "status", "loan_count", "distinct_accounts",
    "average_loan_amount", "share_pct",
)
AMOUNT_BAND_COLUMNS = (
    "loan_amount_band", "status", "loan_count", "distinct_accounts",
    "average_loan_amount", "share_pct",
)


def _decimal(value: str | None) -> Decimal | None:
    if value is None or not value.strip():
        return None
    try:
        parsed = Decimal(value.strip())
    except InvalidOperation:
        return None
    return parsed if parsed.is_finite() else None


def normalize_duration(value: str | None) -> str:
    if value is None or not value.strip():
        return "<MISSING>"
    parsed = _decimal(value)
    if parsed is None:
        return "<INVALID>"
    return format(parsed.normalize(), "f")


def normalize_month(value: str | None) -> str:
    if value is None or not value.strip():
        return "<MISSING>"
    try:
        return date.fromisoformat(value.strip()[:10]).strftime("%Y-%m")
    except ValueError:
        return "<INVALID>"


def _status(value: str | None) -> str:
    return value.strip() if value and value.strip() else "<NULL>"


def normalize_loan_amount_band(value: str | None) -> str:
    """Assign transparent fixed bands; missing, invalid, and non-positive values remain visible."""
    if value is None or not value.strip():
        return "<MISSING>"
    parsed = _decimal(value)
    if parsed is None:
        return "<INVALID>"
    if parsed <= 0:
        return "<NONPOSITIVE>"
    if parsed <= Decimal("50000"):
        return "0 < amount <= 50,000"
    if parsed <= Decimal("100000"):
        return "50,000 < amount <= 100,000"
    if parsed <= Decimal("150000"):
        return "100,000 < amount <= 150,000"
    if parsed <= Decimal("250000"):
        return "150,000 < amount <= 250,000"
    return "amount > 250,000"


def summarize_loans(rows: list[dict[str, str]], dimension: str) -> list[dict[str, str]]:
    """Aggregate one row per dimension/status with shares over all loan rows."""
    if dimension not in {"duration_months", "loan_month", "loan_amount_band"}:
        raise ValueError("dimension must be duration_months, loan_month, or loan_amount_band")
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if dimension == "duration_months":
            group_value = normalize_duration(row.get("duration"))
        elif dimension == "loan_month":
            group_value = normalize_month(row.get("date"))
        else:
            group_value = normalize_loan_amount_band(row.get("amount"))
        grouped[(group_value, _status(row.get("status")))].append(row)

    def sort_key(item: tuple[str, str]):
        group_value, status = item
        if dimension == "duration_months":
            numeric_value = _decimal(group_value)
            group_sort = (0, numeric_value) if numeric_value is not None else (1, group_value)
        elif dimension == "loan_month":
            group_sort = (0, group_value) if len(group_value) == 7 and group_value[4:5] == "-" else (1, group_value)
        else:
            amount_band_order = {
                "<NONPOSITIVE>": 0,
                "0 < amount <= 50,000": 1,
                "50,000 < amount <= 100,000": 2,
                "100,000 < amount <= 150,000": 3,
                "150,000 < amount <= 250,000": 4,
                "amount > 250,000": 5,
                "<MISSING>": 6,
                "<INVALID>": 7,
            }
            group_sort = (0, amount_band_order.get(group_value, 99), group_value)
        return group_sort, status

    output = []
    total_rows = len(rows)
    for (group_value, status), group_rows in sorted(grouped.items(), key=lambda item: sort_key(item[0])):
        accounts = {row.get("account_id", "").strip() for row in group_rows}
        accounts.discard("")
        amounts = [
            value for value in (_decimal(row.get("amount")) for row in group_rows)
            if value is not None
        ]
        average_amount = ""
        if amounts:
            average = (sum(amounts, Decimal("0")) / len(amounts)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            average_amount = format(average, "f")
        share = (
            (Decimal(len(group_rows)) * Decimal("100") / Decimal(total_rows)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if total_rows else Decimal("0.00")
        )
        output.append({
            dimension: group_value,
            "status": status,
            "loan_count": str(len(group_rows)),
            "distinct_accounts": str(len(accounts)),
            "average_loan_amount": average_amount,
            "share_pct": format(share, "f"),
        })
    return output


def _write_csv(path: Path, columns: tuple[str, ...], rows: list[dict[str, str]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(path)



REPAYMENT_COLUMNS = (
    "duration_months", "status", "loan_count", "valid_schedule_rows",
    "valid_ratio_rows", "average_monthly_installment",
    "average_scheduled_total", "average_scheduled_to_principal_ratio",
)


def summarize_scheduled_repayments(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Summarize scheduled installments; these are not observed repayments."""
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[(normalize_duration(row.get("duration")), _status(row.get("status")))].append(row)
    output = []
    for (duration, status), group in sorted(grouped.items()):
        schedules, ratios, installments = [], [], []
        for row in group:
            payment, months, principal = (
                _decimal(row.get("payments")), _decimal(row.get("duration")),
                _decimal(row.get("amount")),
            )
            if payment is not None and months is not None and payment >= 0 and months > 0:
                schedules.append(payment * months)
                installments.append(payment)
                if principal is not None and principal > 0:
                    ratios.append((payment * months) / principal)
        def average(values: list[Decimal]) -> str:
            return format((sum(values, Decimal("0")) / len(values)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP), "f") if values else ""
        output.append({
            "duration_months": duration, "status": status,
            "loan_count": str(len(group)), "valid_schedule_rows": str(len(schedules)),
            "valid_ratio_rows": str(len(ratios)),
            "average_monthly_installment": average(installments),
            "average_scheduled_total": average(schedules),
            "average_scheduled_to_principal_ratio": average(ratios),
        })
    return output


def build_analytics(directory: Path) -> dict:
    source = directory / "loan_analysis_extract.csv"
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            raise ValueError("loan_analysis_extract.csv is missing columns: " + ", ".join(missing))
        loans = list(reader)

    duration_rows = summarize_loans(loans, "duration_months")
    vintage_rows = summarize_loans(loans, "loan_month")
    amount_band_rows = summarize_loans(loans, "loan_amount_band")
    repayment_rows = summarize_scheduled_repayments(loans)
    account_activity = build_account_activity(directory)
    relationship_analysis = build_client_account_relationships(directory)
    district_loan_analysis = build_district_loan_outcomes(directory, loans)
    directory.mkdir(parents=True, exist_ok=True)
    _write_csv(directory / "loan_duration_outcome_summary.csv", SUMMARY_COLUMNS, duration_rows)
    _write_csv(directory / "loan_vintage_outcome_summary.csv", VINTAGE_COLUMNS, vintage_rows)
    _write_csv(directory / "loan_amount_outcome_summary.csv", AMOUNT_BAND_COLUMNS, amount_band_rows)
    _write_csv(directory / "loan_scheduled_repayment_summary.csv", REPAYMENT_COLUMNS, repayment_rows)
    return {
        "source_file": source.name,
        "loan_rows": len(loans),
        "duration_groups": len(duration_rows),
        "vintage_groups": len(vintage_rows),
        "amount_band_groups": len(amount_band_rows),
        "scheduled_repayment_groups": len(repayment_rows),
        "outputs": [
            "loan_duration_outcome_summary.csv",
            "loan_vintage_outcome_summary.csv",
            "loan_amount_outcome_summary.csv",
            "loan_scheduled_repayment_summary.csv",
        ],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "account_activity": account_activity,
        "client_account_relationships": relationship_analysis,
        "district_loan_outcomes": district_loan_analysis,
        "descriptive_only": True,
    }



def build_account_activity(directory: Path) -> dict:
    """Build account-level and observed transaction-category summaries.

    Uses optional raw source CSVs. Transaction categories retain source labels;
    this function does not infer income/expense semantics.
    """
    source_dir = directory / "source_tables"
    account_path, transaction_path = source_dir / "account.csv", source_dir / "trans.csv"
    if not account_path.is_file() or not transaction_path.is_file():
        return {"available": False, "reason": "Both source_tables/account.csv and trans.csv are required."}

    def load(path: Path) -> tuple[list[str], list[dict[str, str]]]:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            return list(reader.fieldnames or []), list(reader)

    account_columns, accounts = load(account_path)
    transaction_columns, transactions = load(transaction_path)
    if "account_id" not in account_columns or "account_id" not in transaction_columns:
        raise ValueError("account.csv and trans.csv must both contain account_id.")
    if not {"amount", "type"} <= set(transaction_columns):
        raise ValueError("trans.csv must contain amount and type columns.")

    account_ids = {row.get("account_id", "").strip() for row in accounts if row.get("account_id", "").strip()}
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in transactions:
        account_id = row.get("account_id", "").strip()
        if account_id:
            grouped[(account_id, _status(row.get("type")))].append(row)

    activity = []
    for (account_id, transaction_type), group in sorted(grouped.items()):
        amounts = [v for v in (_decimal(row.get("amount")) for row in group) if v is not None]
        activity.append({
            "account_id": account_id,
            "transaction_type": transaction_type,
            "transaction_count": str(len(group)),
            "valid_amount_count": str(len(amounts)),
            "amount_sum": format(sum(amounts, Decimal("0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f"),
            "average_amount": format((sum(amounts, Decimal("0")) / len(amounts)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f") if amounts else "",
        })

    district_rows = []
    if "district_id" in account_columns:
        districts: dict[str, set[str]] = defaultdict(set)
        for row in accounts:
            district = row.get("district_id", "").strip() or "<MISSING>"
            account_id = row.get("account_id", "").strip()
            if account_id:
                districts[district].add(account_id)
        district_rows = [
            {"district_id": district, "distinct_accounts": str(len(ids))}
            for district, ids in sorted(districts.items())
        ]

    _write_csv(source_dir / "account_transaction_activity.csv",
               ("account_id", "transaction_type", "transaction_count", "valid_amount_count", "amount_sum", "average_amount"),
               activity)
    if district_rows:
        _write_csv(source_dir / "district_account_summary.csv",
                   ("district_id", "distinct_accounts"), district_rows)
    return {
        "available": True,
        "account_rows": len(accounts),
        "transaction_rows": len(transactions),
        "accounts_with_transactions": len({row["account_id"] for row in activity}),
        "activity_groups": len(activity),
        "district_groups": len(district_rows),
        "unmatched_transaction_accounts": len({row.get("account_id", "").strip() for row in transactions if row.get("account_id", "").strip()} - account_ids),
        "outputs": ["source_tables/account_transaction_activity.csv"] + (["source_tables/district_account_summary.csv"] if district_rows else []),
        "transaction_types_are_unclassified": True,
    }


def build_client_account_relationships(directory: Path) -> dict:
    """Summarize the client-account bridge using the source disposition table."""
    source_dir = directory / "source_tables"
    paths = (source_dir / "client.csv", source_dir / "account.csv", source_dir / "disp.csv")
    if not all(path.is_file() for path in paths):
        return {"available": False, "reason": "client.csv, account.csv and disp.csv are all required."}

    def load(path: Path) -> tuple[list[str], list[dict[str, str]]]:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            return list(reader.fieldnames or []), list(reader)

    client_columns, clients = load(paths[0])
    account_columns, accounts = load(paths[1])
    disp_columns, dispositions = load(paths[2])
    if not ({"client_id"} <= set(client_columns) and {"account_id"} <= set(account_columns)
            and {"disp_id", "client_id", "account_id"} <= set(disp_columns)):
        raise ValueError("client.csv, account.csv and disp.csv are missing required relationship keys.")

    client_ids = {r["client_id"].strip() for r in clients if r.get("client_id", "").strip()}
    account_ids = {r["account_id"].strip() for r in accounts if r.get("account_id", "").strip()}
    client_account_pairs: set[tuple[str, str]] = set()
    client_accounts: dict[str, set[str]] = defaultdict(set)
    account_clients: dict[str, set[str]] = defaultdict(set)
    type_counts: dict[str, int] = defaultdict(int)
    seen_ids: set[str] = set()
    duplicate_ids = 0
    for row in dispositions:
        disp_id = row.get("disp_id", "").strip()
        if disp_id and disp_id in seen_ids:
            duplicate_ids += 1
        if disp_id:
            seen_ids.add(disp_id)
        client_id, account_id = row.get("client_id", "").strip(), row.get("account_id", "").strip()
        observed_type = row.get("type", "").strip() or "<MISSING>"
        type_counts[observed_type] += 1
        if client_id and account_id:
            client_account_pairs.add((client_id, account_id))
            client_accounts[client_id].add(account_id)
            account_clients[account_id].add(client_id)
    _write_csv(source_dir / "client_account_coverage.csv", ("client_id", "distinct_accounts"),
               [{"client_id": k, "distinct_accounts": str(len(v))} for k, v in sorted(client_accounts.items())])
    _write_csv(source_dir / "account_client_coverage.csv", ("account_id", "distinct_clients"),
               [{"account_id": k, "distinct_clients": str(len(v))} for k, v in sorted(account_clients.items())])
    _write_csv(source_dir / "disposition_type_summary.csv", ("observed_disposition_type", "relationship_count"),
               [{"observed_disposition_type": k, "relationship_count": str(v)} for k, v in sorted(type_counts.items())])
    unmatched_clients = {r.get("client_id", "").strip() for r in dispositions if r.get("client_id", "").strip()} - client_ids
    unmatched_accounts = {r.get("account_id", "").strip() for r in dispositions if r.get("account_id", "").strip()} - account_ids
    return {
        "available": True, "client_rows": len(clients), "account_rows": len(accounts),
        "disposition_rows": len(dispositions), "unique_client_account_pairs": len(client_account_pairs),
        "clients_with_accounts": len(client_accounts), "accounts_with_clients": len(account_clients),
        "unmatched_client_ids": len(unmatched_clients), "unmatched_account_ids": len(unmatched_accounts),
        "duplicate_disposition_ids": duplicate_ids,
        "outputs": ["source_tables/client_account_coverage.csv", "source_tables/account_client_coverage.csv", "source_tables/disposition_type_summary.csv"],
        "disposition_types_are_unclassified": True,
    }


def build_district_loan_outcomes(directory: Path, loans: list[dict[str, str]]) -> dict:
    """Summarize loan outcomes by account district without multiplying loan rows."""
    account_path = directory / "source_tables" / "account.csv"
    if not account_path.is_file():
        return {"available": False, "reason": "source_tables/account.csv is required."}
    with account_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        if not {"account_id", "district_id"} <= columns:
            raise ValueError("account.csv must contain account_id and district_id.")
        accounts = list(reader)

    district_values: dict[str, set[str]] = defaultdict(set)
    for row in accounts:
        account_id = row.get("account_id", "").strip()
        if account_id:
            district_values[account_id].add(row.get("district_id", "").strip() or "<MISSING>")
    ambiguous_ids = {key for key, values in district_values.items() if len(values) > 1}
    account_district = {
        key: next(iter(values)) for key, values in district_values.items()
        if len(values) == 1 and key not in ambiguous_ids
    }

    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    mapped_rows = 0
    ambiguous_loan_rows = 0
    for loan in loans:
        account_id = loan.get("account_id", "").strip()
        if account_id in ambiguous_ids:
            district = "<AMBIGUOUS_ACCOUNT_DISTRICT>"
            ambiguous_loan_rows += 1
        elif account_id in account_district:
            district = account_district[account_id]
            mapped_rows += 1
        else:
            district = "<UNMAPPED>"
        grouped[(district, _status(loan.get("status")))].append(loan)

    total = len(loans)
    output = []
    for (district, status), rows in sorted(grouped.items()):
        accounts_in_group = {row.get("account_id", "").strip() for row in rows}
        accounts_in_group.discard("")
        amounts = [value for value in (_decimal(row.get("amount")) for row in rows) if value is not None]
        average = ((sum(amounts, Decimal("0")) / len(amounts)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP) if amounts else None)
        share = (Decimal(len(rows)) * Decimal("100") / Decimal(total)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP) if total else Decimal("0.00")
        output.append({
            "district_id": district, "status": status, "loan_count": str(len(rows)),
            "distinct_accounts": str(len(accounts_in_group)),
            "average_loan_amount": format(average, "f") if average is not None else "",
            "share_pct": format(share, "f"),
        })
    _write_csv(directory / "loan_district_outcome_summary.csv",
               ("district_id", "status", "loan_count", "distinct_accounts", "average_loan_amount", "share_pct"),
               output)
    return {
        "available": True, "loan_rows": total, "mapped_loan_rows": mapped_rows,
        "unmapped_loan_rows": total - mapped_rows - ambiguous_loan_rows,
        "ambiguous_account_district_loan_rows": ambiguous_loan_rows,
        "conflicting_account_district_ids": len(ambiguous_ids),
        "district_status_groups": len(output),
        "outputs": ["loan_district_outcome_summary.csv"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("output"))
    args = parser.parse_args()
    try:
        result = build_analytics(args.directory)
    except (OSError, csv.Error, ValueError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"passed": True, **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
