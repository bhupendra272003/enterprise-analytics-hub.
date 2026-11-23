"""Offline consistency checks for CTU Financial profiler exports.

This validator uses only the Python standard library. It never connects to MariaDB.
Run from the project directory after profile_financial.py has completed.
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import date, datetime, timezone
from pathlib import Path

REQUIRED_FILES = (
    "source_profile.json", "data_quality_summary.csv", "missing_value_profile.csv",
    "relationship_integrity.csv", "loan_analysis_extract.csv",
    "loan_outcome_summary.csv", "loan_prior_features.csv",
)
ALLOWED_STATUSES = {"A", "B", "C", "D"}


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
           "All seven expected exports are present." if not missing else
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
    except (OSError, json.JSONDecodeError, csv.Error) as exc:
        record("artifact_readability", False, str(exc))
        return report

    record("artifact_readability", True, "JSON and CSV exports are readable.")
    record("source_inventory", len(profile.get("inventory", [])) == 8,
           f"Profiler reports {len(profile.get('inventory', []))} of 8 expected source tables.")
    record("data_quality_metrics", bool(quality_rows) and
           {"metric", "value"} <= set(quality_rows[0]),
           f"{len(quality_rows)} metric rows found.")
    record("missing_value_profile", bool(missing_rows) and
           {"table", "column", "row_count", "missing_rows", "missing_pct"} <= set(missing_rows[0]),
           f"{len(missing_rows)} source columns represented.")
    record("relationship_integrity", bool(relationship_rows) and
           {"child_table", "child_column", "parent_table", "parent_column", "orphan_rows"} <= set(relationship_rows[0]),
           f"{len(relationship_rows)} relationship checks represented.")

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
    record("target_leakage_guard",
           "loan_status" not in feature_columns and "status" not in feature_columns,
           "Target status is excluded from the as-of feature CSV.")

    loan_id_set = set(nonblank_ids)
    feature_ids = {row.get("loan_id", "").strip() for row in features}
    unknown_feature_ids = sorted(value for value in feature_ids if value and value not in loan_id_set)
    record("feature_loan_references", not unknown_feature_ids,
           f"{len(unknown_feature_ids)} feature loan IDs do not exist in the loan extract.")

    feature_keys = [(row.get("loan_id", "").strip(),
                     row.get("transaction_type", "").strip()) for row in features]
    duplicate_feature_keys = len(feature_keys) - len(set(feature_keys))
    record("feature_grain", duplicate_feature_keys == 0,
           f"{duplicate_feature_keys} duplicate loan_id/transaction_type groups found.")

    temporal_violations, invalid_counts = [], []
    for index, row in enumerate(features, start=2):
        try:
            count = int(float(row.get("prior_transaction_count", "0") or 0))
            if count < 0:
                invalid_counts.append(index)
        except ValueError:
            invalid_counts.append(index)
        loan_date = parse_date(row.get("loan_date"))
        latest_prior = parse_date(row.get("latest_prior_transaction_date"))
        if latest_prior and (not loan_date or latest_prior >= loan_date):
            temporal_violations.append(index)
    record("prior_transaction_date_boundary", not temporal_violations,
           f"{len(temporal_violations)} feature rows contain a same-day/post-loan or uncheckable latest date.")
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
        "status_groups": len(outcomes), "source_columns_profiled": len(missing_rows),
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
