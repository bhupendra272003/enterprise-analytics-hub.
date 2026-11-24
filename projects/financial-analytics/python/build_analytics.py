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


def summarize_loans(rows: list[dict[str, str]], dimension: str) -> list[dict[str, str]]:
    """Aggregate one row per dimension/status with shares over all loan rows."""
    if dimension not in {"duration_months", "loan_month"}:
        raise ValueError("dimension must be duration_months or loan_month")
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        group_value = (
            normalize_duration(row.get("duration"))
            if dimension == "duration_months"
            else normalize_month(row.get("date"))
        )
        grouped[(group_value, _status(row.get("status")))].append(row)

    def sort_key(item: tuple[str, str]):
        group_value, status = item
        if dimension == "duration_months":
            numeric_value = _decimal(group_value)
            group_sort = (0, numeric_value) if numeric_value is not None else (1, group_value)
        else:
            group_sort = (0, group_value) if len(group_value) == 7 and group_value[4:5] == "-" else (1, group_value)
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
    directory.mkdir(parents=True, exist_ok=True)
    _write_csv(directory / "loan_duration_outcome_summary.csv", SUMMARY_COLUMNS, duration_rows)
    _write_csv(directory / "loan_vintage_outcome_summary.csv", VINTAGE_COLUMNS, vintage_rows)
    return {
        "source_file": source.name,
        "loan_rows": len(loans),
        "duration_groups": len(duration_rows),
        "vintage_groups": len(vintage_rows),
        "outputs": [
            "loan_duration_outcome_summary.csv",
            "loan_vintage_outcome_summary.csv",
        ],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "descriptive_only": True,
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
