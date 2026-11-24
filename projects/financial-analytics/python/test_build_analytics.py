"""Unit tests for offline Financial grouped analytical outputs."""
import csv
import tempfile
import unittest
from pathlib import Path

from build_analytics import build_analytics, summarize_loans


class BuildAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        rows = [
            {"loan_id": "1", "account_id": "100", "date": "1994-01-10", "amount": "1000", "duration": "12", "status": "A"},
            {"loan_id": "2", "account_id": "200", "date": "1994-01-20", "amount": "2000", "duration": "12.0", "status": "B"},
            {"loan_id": "3", "account_id": "100", "date": "1994-02-01", "amount": "3000", "duration": "24", "status": "A"},
        ]
        with (self.directory / "loan_analysis_extract.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def tearDown(self):
        self.temp.cleanup()

    def test_builds_duration_and_vintage_outputs(self):
        result = build_analytics(self.directory)
        self.assertEqual(result["loan_rows"], 3)
        self.assertEqual(result["duration_groups"], 3)
        self.assertEqual(result["vintage_groups"], 3)
        with (self.directory / "loan_duration_outcome_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            duration = list(csv.DictReader(handle))
        self.assertEqual(sum(int(row["loan_count"]) for row in duration), 3)
        self.assertEqual(duration[0]["duration_months"], "12")
        self.assertEqual(duration[0]["average_loan_amount"], "1000.00")
        self.assertAlmostEqual(sum(float(row["share_pct"]) for row in duration), 100.0, places=1)

    def test_missing_values_are_visible_not_dropped(self):
        rows = [
            {"loan_id": "1", "account_id": "", "date": "", "amount": "", "duration": "", "status": ""},
            {"loan_id": "2", "account_id": "2", "date": "not-a-date", "amount": "bad", "duration": "unknown", "status": "C"},
        ]
        summary = summarize_loans(rows, "loan_month")
        self.assertEqual({row["loan_month"] for row in summary}, {"<MISSING>", "<INVALID>"})
        self.assertEqual({row["status"] for row in summary}, {"<NULL>", "C"})
        duration = summarize_loans(rows, "duration_months")
        self.assertEqual({row["duration_months"] for row in duration}, {"<MISSING>", "<INVALID>"})

    def test_missing_required_source_column_fails(self):
        (self.directory / "loan_analysis_extract.csv").write_text("loan_id,status\n1,A\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "missing columns"):
            build_analytics(self.directory)


if __name__ == "__main__":
    unittest.main()
