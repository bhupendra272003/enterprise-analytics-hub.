"""Unit tests for the standard-library Financial export validator."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

from validate_exports import validate_exports


class ExportValidatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        profile = {
            "inventory": [{"table": name, "columns": 1} for name in (
                "account", "client", "disp", "card", "loan", "orders", "trans", "district"
            )],
            "loan_rows_exported": 2,
            "feature_rows_exported": 1,
            "relationship_integrity": [{"orphan_rows": 0}],
            "status_distribution": {"A": 1, "B": 1},
        }
        (self.directory / "source_profile.json").write_text(json.dumps(profile), encoding="utf-8")
        self.write_csv("data_quality_summary.csv", [{"metric": "rows.loan", "value": "2"}])
        self.write_csv("missing_value_profile.csv", [
            {"table": "loan", "column": "status", "row_count": "2", "missing_rows": "0", "missing_pct": "0"},
            *[
                {"table": "other", "column": f"column_{i}", "row_count": "1", "missing_rows": "0", "missing_pct": "0"}
                for i in range(7)
            ],
        ])
        self.write_csv("relationship_integrity.csv", [
            {"child_table": "loan", "child_column": "account_id", "parent_table": "account", "parent_column": "account_id", "orphan_rows": "0"},
        ])
        self.write_csv("loan_analysis_extract.csv", [
            {"loan_id": "1", "account_id": "100", "date": "1994-01-10", "amount": "1000", "duration": "12", "payments": "100", "status": "A"},
            {"loan_id": "2", "account_id": "200", "date": "1994-02-10", "amount": "2000", "duration": "24", "payments": "100", "status": "B"},
        ])
        self.write_csv("loan_outcome_summary.csv", [
            {"status": "A", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "1000", "average_duration_months": "12", "share_pct": "50"},
            {"status": "B", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "2000", "average_duration_months": "24", "share_pct": "50"},
        ])
        self.write_csv("loan_duration_outcome_summary.csv", [
            {"duration_months": "12", "status": "A", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "1000.00", "share_pct": "50.00"},
            {"duration_months": "24", "status": "B", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "2000.00", "share_pct": "50.00"},
        ])
        self.write_csv("loan_vintage_outcome_summary.csv", [
            {"loan_month": "1994-01", "status": "A", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "1000.00", "share_pct": "50.00"},
            {"loan_month": "1994-02", "status": "B", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "2000.00", "share_pct": "50.00"},
        ])
        self.write_csv("loan_scheduled_repayment_summary.csv", [
            {"duration_months": "12", "status": "A", "loan_count": "1", "valid_schedule_rows": "1", "valid_ratio_rows": "1", "average_monthly_installment": "100.00", "average_scheduled_total": "1200.00", "average_scheduled_to_principal_ratio": "1.20"},
            {"duration_months": "24", "status": "B", "loan_count": "1", "valid_schedule_rows": "1", "valid_ratio_rows": "1", "average_monthly_installment": "100.00", "average_scheduled_total": "2400.00", "average_scheduled_to_principal_ratio": "1.20"},
        ])
        self.write_csv("loan_prior_features.csv", [{
            "loan_id": "1", "account_id": "100", "loan_date": "1994-01-10",
            "loan_amount": "1000", "loan_duration_months": "12",
            "transaction_type": "credit", "prior_transaction_count": "2",
            "prior_transaction_amount_sum": "200", "prior_transaction_amount_avg": "100",
            "prior_balance_avg": "300", "prior_balance_min": "250",
            "prior_balance_max": "350", "first_prior_transaction_date": "1994-01-01",
            "latest_prior_transaction_date": "1994-01-09",
        }])

    def tearDown(self):
        self.temp.cleanup()

    def write_csv(self, name, rows):
        with (self.directory / name).open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def test_valid_exports_pass(self):
        report = validate_exports(self.directory)
        self.assertTrue(report["passed"], report["errors"])

    def test_target_leakage_and_temporal_leakage_fail(self):
        self.write_csv("loan_prior_features.csv", [{
            "loan_id": "1", "account_id": "100", "loan_date": "1994-01-10",
            "transaction_type": "credit", "prior_transaction_count": "2",
            "latest_prior_transaction_date": "1994-01-10", "loan_status": "A",
        }])
        report = validate_exports(self.directory)
        failed = {item["check"] for item in report["errors"]}
        self.assertIn("target_leakage_guard", failed)
        self.assertIn("prior_transaction_date_boundary", failed)

    def test_invalid_feature_date_fails_cleanly(self):
        rows = [{
            "loan_id": "1", "account_id": "100", "loan_date": "not-a-date",
            "transaction_type": "credit", "prior_transaction_count": "2",
            "first_prior_transaction_date": "1994-01-01",
            "latest_prior_transaction_date": "1994-01-09",
        }]
        self.write_csv("loan_prior_features.csv", rows)
        report = validate_exports(self.directory)
        self.assertIn("feature_date_format", {item["check"] for item in report["errors"]})

    def test_feature_row_count_mismatch_fails(self):
        profile_path = self.directory / "source_profile.json"
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        profile["feature_rows_exported"] = 2
        profile_path.write_text(json.dumps(profile), encoding="utf-8")
        report = validate_exports(self.directory)
        self.assertIn("feature_row_count", {item["check"] for item in report["errors"]})

    def test_grouped_summary_mismatch_fails(self):
        self.write_csv("loan_duration_outcome_summary.csv", [
            {"duration_months": "12", "status": "A", "loan_count": "9", "distinct_accounts": "1", "average_loan_amount": "1000.00", "share_pct": "50.00"},
            {"duration_months": "24", "status": "B", "loan_count": "1", "distinct_accounts": "1", "average_loan_amount": "2000.00", "share_pct": "50.00"},
        ])
        report = validate_exports(self.directory)
        self.assertIn("duration_outcome_summary_reconciliation", {item["check"] for item in report["errors"]})

    def test_missing_required_export_fails(self):
        (self.directory / "loan_prior_features.csv").unlink()
        report = validate_exports(self.directory)
        self.assertFalse(report["passed"])
        self.assertIn("required_artifacts", {item["check"] for item in report["errors"]})


if __name__ == "__main__":
    unittest.main()
