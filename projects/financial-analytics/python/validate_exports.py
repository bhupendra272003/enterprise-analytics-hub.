"""Offline consistency checks for CTU Financial profiler exports.

This validator uses only the Python standard library. It never connects to MariaDB.
Run from the project directory after profile_financial.py has completed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from build_analytics import summarize_loans, summarize_scheduled_repayments

REQUIRED_FILES = (
    "source_profile.json", "data_quality_summary.csv", "missing_value_profile.csv",
    "relationship_integrity.csv", "loan_analysis_extract.csv",
    "loan_outcome_summary.csv", "loan_prior_features.csv",
    "loan_duration_outcome_summary.csv", "loan_vintage_outcome_summary.csv",
    "loan_amount_outcome_summary.csv", "loan_scheduled_repayment_summary.csv",
)
ALLOWED_STATUSES = {"A", "B", "C", "D"}

SOURCE_TABLES = {"account", "client", "disp", "card", "loan", "orders", "trans", "district"}


def validate_raw_source_exports(directory: Path) -> tuple[bool, str]:
    """Validate optional chunked raw-table CSVs against their completion manifest."""
    export_dir = directory / "source_tables"
    manifest_path = export_dir / "manifest.json"
    if not manifest_path.is_file():
        return True, "Optional raw source-table export not present; profiler-only validation continues."
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        tables = manifest.get("tables", {})
        version = int(manifest.get("manifest_version", 1))
        if version not in (1, 2):
            return False, f"Unsupported raw export manifest version: {version}."
        if manifest.get("dataset") != "financial" or manifest.get("read_only") is not True:
            return False, "Manifest dataset/read_only metadata is invalid."
        if set(tables) != SOURCE_TABLES:
            return False, f"Manifest table set differs from expected eight: {sorted(tables)}."
        checked = []
        for table in sorted(SOURCE_TABLES):
            item = tables[table]
            expected_filename = f"{table}.csv"
            if item.get("file") != expected_filename:
                return False, f"{table}: manifest filename must be {expected_filename!r}."
            path = export_dir / expected_filename
            expected_columns = item["columns"]
            try:
                expected_row_count = int(item["row_count"])
                expected_column_count = int(item["column_count"])
            except (TypeError, ValueError):
                return False, f"{table}: manifest row/column counts must be integers."
            if expected_row_count < 0 or expected_column_count < 1:
                return False, f"{table}: manifest row/column counts are out of range."
            if not path.is_file() or not expected_columns:
                return False, f"{table}: missing CSV or empty column definition."
            if len(expected_columns) != expected_column_count:
                return False, f"{table}: manifest column_count does not match columns."
            if version >= 2 and (not item.get("sha256") or item.get("byte_size") is None):
                return False, f"{table}: version 2 manifest requires byte_size and sha256."
            if item.get("byte_size") is not None:
                try:
                    expected_bytes = int(item["byte_size"])
                except (TypeError, ValueError):
                    return False, f"{table}: manifest byte_size must be an integer."
                if expected_bytes < 0 or path.stat().st_size != expected_bytes:
                    return False, f"{table}: file byte size does not match manifest."
            if item.get("sha256") is not None:
                expected_hash = str(item["sha256"]).lower()
                if len(expected_hash) != 64 or any(c not in "0123456789abcdef" for c in expected_hash):
                    return False, f"{table}: manifest sha256 is not a valid SHA-256 hex digest."
                digest = hashlib.sha256()
                with path.open("rb") as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(chunk)
                if digest.hexdigest() != expected_hash:
                    return False, f"{table}: SHA-256 checksum mismatch."
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle)
                header = next(reader, None)
                if header != expected_columns or len(header) != expected_column_count:
                    return False, f"{table}: CSV header does not match manifest."
                row_count = sum(1 for _ in reader)
            if row_count != expected_row_count:
                return False, f"{table}: CSV has {row_count} rows; manifest says {expected_row_count}."
            checked.append(f"{table}={row_count}")
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError, csv.Error, StopIteration) as exc:
        return False, f"Raw source export validation error: {exc}"
    return True, "All eight raw CSVs match manifest row counts, headers, and available checksums (" + ", ".join(checked) + ")."




def validate_source_relationships(directory: Path) -> tuple[bool, str]:
    """Check all documented source-table foreign keys and parent-key uniqueness."""
    source = directory / "source_tables"
    required = {
        "account": ("account_id", "district_id"),
        "client": ("client_id", "district_id"),
        "disp": ("disp_id", "account_id", "client_id"),
        "card": ("card_id", "disp_id"),
        "loan": ("loan_id", "account_id"),
        "orders": ("order_id", "account_id"),
        "trans": ("trans_id", "account_id"),
        "district": ("A1",),
    }
    if not all((source / f"{table}.csv").is_file() for table in SOURCE_TABLES):
        return True, "Eight raw source CSVs are not all present; source relationship audit skipped."
    tables = {name: read_csv(source / f"{name}.csv") for name in SOURCE_TABLES}
    for table, columns in required.items():
        available = set(tables[table][0]) if tables[table] else set()
        # Empty tables still have a header; read_csv does not expose it through rows.
        with (source / f"{table}.csv").open("r", encoding="utf-8-sig", newline="") as handle:
            header = set(next(csv.reader(handle), []))
        missing = set(columns) - header
        if missing:
            return False, f"{table}.csv is missing required relationship columns: {sorted(missing)}."
    primary_keys = {
        "account": "account_id", "client": "client_id", "disp": "disp_id",
        "card": "card_id", "loan": "loan_id", "orders": "order_id",
        "trans": "trans_id", "district": "A1",
    }
    duplicates = []
    indexes = {}
    for table, key in primary_keys.items():
        values = [row.get(key, "").strip() for row in tables[table] if row.get(key, "").strip()]
        if len(values) != len(set(values)):
            duplicates.append(f"{table}.{key}")
        indexes[table] = set(values)
    if duplicates:
        return False, "Duplicate parent/source keys found: " + ", ".join(duplicates) + "."
    edges = (
        ("account", "district_id", "district", "A1"),
        ("client", "district_id", "district", "A1"),
        ("disp", "account_id", "account", "account_id"),
        ("disp", "client_id", "client", "client_id"),
        ("card", "disp_id", "disp", "disp_id"),
        ("loan", "account_id", "account", "account_id"),
        ("orders", "account_id", "account", "account_id"),
        ("trans", "account_id", "account", "account_id"),
    )
    failures = []
    for child, child_col, parent, parent_col in edges:
        orphan_count = sum(
            1 for row in tables[child]
            if row.get(child_col, "").strip() and row[child_col].strip() not in indexes[parent]
        )
        if orphan_count:
            failures.append(f"{child}.{child_col}->{parent}.{parent_col}: {orphan_count}")
    if failures:
        return False, "Foreign-key orphan rows found: " + "; ".join(failures) + "."
    return True, f"All 8 source tables have unique source keys and all {len(edges)} documented relationship edges have zero nonblank orphans."


def validate_client_account_outputs(directory: Path) -> tuple[bool, str]:
    """Reconcile derived client/account bridge CSVs to the raw disposition table."""
    source = directory / "source_tables"
    raw_paths = (source / "client.csv", source / "account.csv", source / "disp.csv")
    output_paths = (
        source / "client_account_coverage.csv",
        source / "account_client_coverage.csv",
        source / "disposition_type_summary.csv",
    )
    if not all(path.is_file() for path in raw_paths):
        return True, "Client-account raw exports are incomplete; bridge reconciliation skipped."
    if not all(path.is_file() for path in output_paths):
        return False, "Raw client/account/disp exports exist but one or more derived bridge outputs are missing."

    clients, accounts, dispositions = (read_csv(path) for path in raw_paths)
    client_ids = {r.get("client_id", "").strip() for r in clients if r.get("client_id", "").strip()}
    account_ids = {r.get("account_id", "").strip() for r in accounts if r.get("account_id", "").strip()}
    expected_client: dict[str, set[str]] = {}
    expected_account: dict[str, set[str]] = {}
    expected_types: dict[str, int] = {}
    for row in dispositions:
        client_id, account_id = row.get("client_id", "").strip(), row.get("account_id", "").strip()
        if client_id and account_id:
            expected_client.setdefault(client_id, set()).add(account_id)
            expected_account.setdefault(account_id, set()).add(client_id)
        label = row.get("type", "").strip() or "<MISSING>"
        expected_types[label] = expected_types.get(label, 0) + 1

    actual_client_rows = read_csv(output_paths[0])
    actual_account_rows = read_csv(output_paths[1])
    actual_type_rows = read_csv(output_paths[2])
    actual_client = {r.get("client_id", ""): r.get("distinct_accounts", "") for r in actual_client_rows}
    actual_account = {r.get("account_id", ""): r.get("distinct_clients", "") for r in actual_account_rows}
    actual_types = {r.get("observed_disposition_type", ""): r.get("relationship_count", "") for r in actual_type_rows}
    expected_client_counts = {k: str(len(v)) for k, v in expected_client.items()}
    expected_account_counts = {k: str(len(v)) for k, v in expected_account.items()}
    expected_type_counts = {k: str(v) for k, v in expected_types.items()}
    passed = (actual_client == expected_client_counts and actual_account == expected_account_counts
              and actual_types == expected_type_counts)
    unmatched_clients = {r.get("client_id", "").strip() for r in dispositions if r.get("client_id", "").strip()} - client_ids
    unmatched_accounts = {r.get("account_id", "").strip() for r in dispositions if r.get("account_id", "").strip()} - account_ids
    detail = (
        f"Disposition rows={len(dispositions)}; client groups={len(actual_client)}; "
        f"account groups={len(actual_account)}; unmatched clients={len(unmatched_clients)}; "
        f"unmatched accounts={len(unmatched_accounts)}."
    )
    return passed, detail


def validate_district_loan_outputs(directory: Path) -> tuple[bool, str]:
    """Reconcile district loan summaries to the loan extract and unique account mappings."""
    account_path = directory / "source_tables" / "account.csv"
    output_path = directory / "loan_district_outcome_summary.csv"
    if not account_path.is_file():
        return True, "Optional account.csv is absent; district loan reconciliation skipped."
    if not output_path.is_file():
        return False, "account.csv exists but loan_district_outcome_summary.csv is missing."
    with account_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not {"account_id", "district_id"} <= set(reader.fieldnames or []):
            return False, "account.csv lacks account_id or district_id."
        accounts = list(reader)
    loans = read_csv(directory / "loan_analysis_extract.csv")
    district_values: dict[str, set[str]] = {}
    for row in accounts:
        account_id = row.get("account_id", "").strip()
        if account_id:
            district_values.setdefault(account_id, set()).add(row.get("district_id", "").strip() or "<MISSING>")
    mapping = {key: next(iter(values)) for key, values in district_values.items() if len(values) == 1}
    expected: dict[tuple[str, str], list[dict[str, str]]] = {}
    for loan in loans:
        account_id = loan.get("account_id", "").strip()
        district = ("<AMBIGUOUS_ACCOUNT_DISTRICT>" if account_id in district_values and len(district_values[account_id]) > 1
                    else mapping.get(account_id, "<UNMAPPED>"))
        status = loan.get("status", "").strip() or "<NULL>"
        expected.setdefault((district, status), []).append(loan)
    actual_rows = read_csv(output_path)
    actual = {(r.get("district_id", ""), r.get("status", "")): r for r in actual_rows}
    passed = len(actual) == len(actual_rows) and set(actual) == set(expected)
    if passed:
        for key, rows in expected.items():
            row = actual[key]
            accounts_in_group = {item.get("account_id", "").strip() for item in rows}
            accounts_in_group.discard("")
            amounts = []
            for item in rows:
                try:
                    value = Decimal(item.get("amount", "").strip())
                    if value.is_finite():
                        amounts.append(value)
                except (InvalidOperation, TypeError, AttributeError):
                    pass
            average = (format((sum(amounts, Decimal("0")) / len(amounts)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP), "f") if amounts else "")
            share_value = (Decimal(len(rows)) * Decimal("100") / Decimal(len(loans))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP) if loans else Decimal("0.00")
            share = format(share_value, "f")
            passed = (row.get("loan_count") == str(len(rows))
                      and row.get("distinct_accounts") == str(len(accounts_in_group))
                      and row.get("average_loan_amount") == average
                      and row.get("share_pct") == share)
            if not passed:
                break
    return passed, f"{len(loans)} loan rows reconciled across {len(expected)} district/status groups."


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value[:10])


def validate_exports(directory: Path) -> dict:
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "directory": str(directory.resolve()),
        "passed": False, "checks": [], "errors": [], "warnings": [],
    }

    def record(name: str, passed: bool, detail: str, severity: str = "error") -> None:
        item = {"check": name, "passed": bool(passed), "detail": detail}
        report["checks"].append(item)
        if not passed:
            report[severity + "s"].append(item)

    missing = [name for name in REQUIRED_FILES if not (directory / name).is_file()]
    record("required_artifacts", not missing,
           "All required exports are present." if not missing else
           "Missing files: " + ", ".join(missing))
    if missing:
        return report

    try:
        profile = json.loads((directory / "source_profile.json").read_text(encoding="utf-8"))
        quality_rows = read_csv(directory / "data_quality_summary.csv")
        missing_rows = read_csv(directory / "missing_value_profile.csv")
        relationship_rows = read_csv(directory / "relationship_integrity.csv")
        loans = read_csv(directory / "loan_analysis_extract.csv")
        outcomes = read_csv(directory / "loan_outcome_summary.csv")
        features = read_csv(directory / "loan_prior_features.csv")
        duration_summary = read_csv(directory / "loan_duration_outcome_summary.csv")
        vintage_summary = read_csv(directory / "loan_vintage_outcome_summary.csv")
        amount_band_summary = read_csv(directory / "loan_amount_outcome_summary.csv")
        repayment_summary = read_csv(directory / "loan_scheduled_repayment_summary.csv")
    except (OSError, json.JSONDecodeError, csv.Error) as exc:
        record("artifact_readability", False, str(exc))
        return report

    record("artifact_readability", True, "JSON and CSV exports are readable.")
    raw_ok, raw_detail = validate_raw_source_exports(directory)
    source_rel_ok, source_rel_detail = validate_source_relationships(directory)
    record("eight_table_relationship_integrity", source_rel_ok, source_rel_detail)
    record("raw_source_table_exports", raw_ok, raw_detail)
    bridge_ok, bridge_detail = validate_client_account_outputs(directory)
    record("client_account_bridge_reconciliation", bridge_ok, bridge_detail)
    district_ok, district_detail = validate_district_loan_outputs(directory)
    record("district_loan_outcome_reconciliation", district_ok, district_detail)
    inventory = profile.get("inventory", [])
    record("source_inventory", len(inventory) == 8,
           f"Profiler reports {len(inventory)} of 8 expected source tables.")
    expected_column_count = sum(int(item.get("columns", 0)) for item in inventory)
    record("missing_profile_coverage", len(missing_rows) == expected_column_count,
           f"Missing-value profile contains {len(missing_rows)} rows for {expected_column_count} source columns.")
    record("data_quality_metrics", bool(quality_rows) and
           {"metric", "value"} <= set(quality_rows[0]),
           f"{len(quality_rows)} metric rows found.")
    record("missing_value_profile", bool(missing_rows) and
           {"table", "column", "row_count", "missing_rows", "missing_pct"} <= set(missing_rows[0]),
           f"{len(missing_rows)} source columns represented.")
    record("relationship_integrity", bool(relationship_rows) and
           {"child_table", "child_column", "parent_table", "parent_column", "orphan_rows"} <= set(relationship_rows[0]),
           f"{len(relationship_rows)} relationship checks represented.")
    record("relationship_profile_reconciliation",
           len(relationship_rows) == len(profile.get("relationship_integrity", [])),
           f"CSV has {len(relationship_rows)} relationship checks; JSON has {len(profile.get('relationship_integrity', []))}.")

    loan_ids = [row.get("loan_id", "").strip() for row in loans]
    nonblank_ids = [value for value in loan_ids if value]
    duplicate_ids = len(nonblank_ids) - len(set(nonblank_ids))
    record("loan_extract_rows", len(loans) == int(profile.get("loan_rows_exported", -1)),
           f"CSV has {len(loans)} rows; profile records {profile.get('loan_rows_exported')}.")
    record("loan_id_completeness", len(nonblank_ids) == len(loans),
           f"{len(loans) - len(nonblank_ids)} loan_id values are blank.")
    record("loan_id_uniqueness", duplicate_ids == 0,
           f"{duplicate_ids} repeated loan_id rows found.")

    unknown_statuses = sorted({
        row.get("status", "").strip() for row in loans
        if row.get("status", "").strip() and row.get("status", "").strip() not in ALLOWED_STATUSES
    })
    record("loan_status_domain", not unknown_statuses,
           "Statuses are within A/B/C/D." if not unknown_statuses else
           "Unexpected status values: " + ", ".join(unknown_statuses))

    outcome_map, outcome_total = {}, 0
    for row in outcomes:
        status = row.get("status", "").strip()
        try:
            count = int(float(row.get("loan_count", "0") or 0))
        except ValueError:
            count = -1
        outcome_map[status] = count
        outcome_total += max(count, 0)
    source_status_map = {}
    for row in loans:
        status = row.get("status", "").strip()
        source_status_map[status] = source_status_map.get(status, 0) + 1
    record("outcome_reconciliation",
           outcome_total == len(loans) and outcome_map == source_status_map,
           f"Outcome summary totals {outcome_total} rows against {len(loans)} loan rows.")
    profile_status_map = {
        ("" if status == "<NULL>" else status): int(count)
        for status, count in profile.get("status_distribution", {}).items()
    }
    record("profile_status_reconciliation", profile_status_map == source_status_map,
           "JSON status distribution matches the loan CSV." if profile_status_map == source_status_map else
           "JSON and CSV status distributions differ.")

    try:
        shares = [float(row.get("share_pct", "0") or 0) for row in outcomes]
        share_total = sum(shares)
        share_ok = not outcomes or abs(share_total - 100.0) <= 0.1
    except ValueError:
        share_total, share_ok = 0.0, False
    record("outcome_share_total", share_ok, f"Status shares total {share_total:.2f}%.")

    required_feature_columns = {
        "loan_id", "account_id", "loan_date", "transaction_type",
        "prior_transaction_count", "latest_prior_transaction_date",
    }
    feature_columns = set(features[0]) if features else set()
    record("feature_schema", bool(features) and required_feature_columns <= feature_columns,
           f"{len(features)} feature rows; required columns present: {required_feature_columns <= feature_columns}.")
    record("feature_row_count", len(features) == int(profile.get("feature_rows_exported", -1)),
           f"CSV has {len(features)} feature rows; profile records {profile.get('feature_rows_exported')}.")
    record("target_leakage_guard",
           "loan_status" not in feature_columns and "status" not in feature_columns,
           "Target status is excluded from the as-of feature CSV.")

    def reconcile_analytics_summary(name: str, dimension: str, rows: list[dict[str, str]]) -> None:
        required = {
            dimension, "status", "loan_count", "distinct_accounts",
            "average_loan_amount", "share_pct",
        }
        schema_ok = bool(rows) and required <= set(rows[0])
        if not schema_ok:
            record(name, False, f"Required columns missing: {sorted(required - (set(rows[0]) if rows else set()))}.")
            return
        expected_rows = summarize_loans(loans, dimension)
        expected_map = {(row[dimension], row["status"]): row for row in expected_rows}
        actual_map = {}
        duplicate_keys = 0
        for row in rows:
            key = (row.get(dimension, ""), row.get("status", ""))
            if key in actual_map:
                duplicate_keys += 1
            actual_map[key] = {column: row.get(column, "") for column in required}
        expected_map = {
            key: {column: row.get(column, "") for column in required}
            for key, row in expected_map.items()
        }
        passed = duplicate_keys == 0 and actual_map == expected_map
        record(
            name, passed,
            f"{len(rows)} grouped rows; {duplicate_keys} duplicate group keys; "
            f"expected {len(expected_map)} groups from {len(loans)} loan rows.",
        )

    reconcile_analytics_summary(
        "duration_outcome_summary_reconciliation", "duration_months", duration_summary
    )
    reconcile_analytics_summary(
        "vintage_outcome_summary_reconciliation", "loan_month", vintage_summary
    )
    reconcile_analytics_summary(
        "amount_band_outcome_summary_reconciliation", "loan_amount_band", amount_band_summary
    )

    expected_repayments = summarize_scheduled_repayments(loans)
    repayment_columns = {
        "duration_months", "status", "loan_count", "valid_schedule_rows",
        "valid_ratio_rows", "average_monthly_installment",
        "average_scheduled_total", "average_scheduled_to_principal_ratio",
    }
    expected_repayment_map = {
        (row["duration_months"], row["status"]): {key: row[key] for key in repayment_columns}
        for row in expected_repayments
    }
    actual_repayment_map = {}
    for row in repayment_summary:
        key = (row.get("duration_months", ""), row.get("status", ""))
        if key in actual_repayment_map:
            actual_repayment_map[key] = None
        else:
            actual_repayment_map[key] = {key_name: row.get(key_name, "") for key_name in repayment_columns}
    record("scheduled_repayment_reconciliation",
           actual_repayment_map == expected_repayment_map,
           f"{len(repayment_summary)} scheduled repayment groups reconciled to {len(loans)} loan rows.")


    loan_id_set = set(nonblank_ids)
    feature_ids = [row.get("loan_id", "").strip() for row in features]
    unknown_feature_ids = sorted(value for value in set(feature_ids) if value and value not in loan_id_set)
    record("feature_loan_id_completeness", all(feature_ids),
           f"{sum(not value for value in feature_ids)} feature rows have a blank loan_id.")
    record("feature_loan_references", not unknown_feature_ids,
           f"{len(unknown_feature_ids)} feature loan IDs do not exist in the loan extract.")

    feature_keys = [(row.get("loan_id", "").strip(),
                     row.get("transaction_type", "").strip()) for row in features]
    duplicate_feature_keys = len(feature_keys) - len(set(feature_keys))
    record("feature_grain", duplicate_feature_keys == 0,
           f"{duplicate_feature_keys} duplicate loan_id/transaction_type groups found.")

    temporal_violations, invalid_dates, invalid_counts = [], [], []
    for index, row in enumerate(features, start=2):
        try:
            count = int(float(row.get("prior_transaction_count", "0") or 0))
            if count < 0:
                invalid_counts.append(index)
        except ValueError:
            invalid_counts.append(index)
        try:
            loan_date = parse_date(row.get("loan_date"))
            first_prior = parse_date(row.get("first_prior_transaction_date"))
            latest_prior = parse_date(row.get("latest_prior_transaction_date"))
        except ValueError:
            invalid_dates.append(index)
            continue
        if (first_prior and (not loan_date or first_prior >= loan_date)) or (
            latest_prior and (not loan_date or latest_prior >= loan_date)
        ) or (first_prior and latest_prior and first_prior > latest_prior):
            temporal_violations.append(index)
        if count == 0 and (first_prior or latest_prior):
            temporal_violations.append(index)
        if count > 0 and not latest_prior:
            temporal_violations.append(index)
    record("feature_date_format", not invalid_dates,
           f"{len(invalid_dates)} feature rows contain invalid ISO dates.")
    record("prior_transaction_date_boundary", not temporal_violations,
           f"{len(temporal_violations)} feature rows have inconsistent or non-prior transaction dates.")
    record("prior_transaction_count_domain", not invalid_counts,
           f"{len(invalid_counts)} feature rows contain invalid transaction counts.")

    orphan_total = 0
    for row in relationship_rows:
        try:
            orphan_total += int(float(row.get("orphan_rows", "0") or 0))
        except ValueError:
            orphan_total += 1
    record("foreign_key_orphans", orphan_total == 0,
           f"{orphan_total} orphan relationship rows reported.", severity="warning")

    report["summary"] = {
        "loan_rows": len(loans), "feature_rows": len(features),
        "status_groups": len(outcomes), "duration_groups": len(duration_summary),
        "vintage_groups": len(vintage_summary), "amount_band_groups": len(amount_band_summary),
        "scheduled_repayment_groups": len(repayment_summary),
        "source_columns_profiled": len(missing_rows),
        "relationship_checks": len(relationship_rows),
        "foreign_key_orphan_rows": orphan_total,
    }
    report["passed"] = not report["errors"]
    return report


def write_report(directory: Path, report: dict) -> None:
    (directory / "validation_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    with (directory / "validation_summary.csv").open(
        "w", encoding="utf-8", newline=""
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=("check", "passed", "detail"))
        writer.writeheader()
        writer.writerows(report["checks"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("output"))
    args = parser.parse_args()
    report = validate_exports(args.directory)
    if args.directory.is_dir():
        write_report(args.directory, report)
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
