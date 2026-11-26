"""Unit tests for offline Financial grouped analytical outputs."""
import csv
import tempfile
import unittest
from pathlib import Path

from build_analytics import build_analytics, normalize_loan_amount_band, summarize_loans


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
        self.assertEqual(result["scheduled_repayment_groups"], 3)
        self.assertEqual(result["amount_band_groups"], 2)
        with (self.directory / "loan_amount_outcome_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            amount_bands = list(csv.DictReader(handle))
        self.assertEqual(sum(int(row["loan_count"]) for row in amount_bands), 3)
        self.assertEqual({row["loan_amount_band"] for row in amount_bands}, {"0 < amount <= 50,000"})
        with (self.directory / "loan_scheduled_repayment_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            repayment = list(csv.DictReader(handle))
        self.assertEqual(sum(int(row["loan_count"]) for row in repayment), 3)
        with (self.directory / "loan_duration_outcome_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            duration = list(csv.DictReader(handle))
        self.assertEqual(sum(int(row["loan_count"]) for row in duration), 3)
        self.assertEqual(duration[0]["duration_months"], "12")
        self.assertEqual(duration[0]["average_loan_amount"], "1000.00")
        self.assertAlmostEqual(sum(float(row["share_pct"]) for row in duration), 100.0, places=1)

    def test_amount_band_boundaries_and_exceptions(self):
        self.assertEqual(normalize_loan_amount_band("50000"), "0 < amount <= 50,000")
        self.assertEqual(normalize_loan_amount_band("50000.01"), "50,000 < amount <= 100,000")
        self.assertEqual(normalize_loan_amount_band("100000"), "50,000 < amount <= 100,000")
        self.assertEqual(normalize_loan_amount_band("100001"), "100,000 < amount <= 150,000")
        self.assertEqual(normalize_loan_amount_band("150000"), "100,000 < amount <= 150,000")
        self.assertEqual(normalize_loan_amount_band("150001"), "150,000 < amount <= 250,000")
        self.assertEqual(normalize_loan_amount_band("250000"), "150,000 < amount <= 250,000")
        self.assertEqual(normalize_loan_amount_band("250001"), "amount > 250,000")
        self.assertEqual(normalize_loan_amount_band("0"), "<NONPOSITIVE>")
        self.assertEqual(normalize_loan_amount_band("-1"), "<NONPOSITIVE>")
        self.assertEqual(normalize_loan_amount_band(""), "<MISSING>")
        self.assertEqual(normalize_loan_amount_band("bad"), "<INVALID>")

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


    def test_account_activity_keeps_observed_categories_and_districts(self):
        source = self.directory / "source_tables"
        source.mkdir()
        (source / "account.csv").write_text(
            "account_id,district_id\n10,2\n20,2\n30,3\n", encoding="utf-8"
        )
        (source / "trans.csv").write_text(
            "trans_id,account_id,type,amount\n1,10,PRIJEM,100\n2,10,VYDAJ,25\n3,20,PRIJEM,50\n",
            encoding="utf-8",
        )
        from build_analytics import build_account_activity
        result = build_account_activity(self.directory)
        self.assertTrue(result["available"])
        self.assertEqual(result["activity_groups"], 3)
        self.assertEqual(result["unmatched_transaction_accounts"], 0)
        with (source / "account_transaction_activity.csv").open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual({row["transaction_type"] for row in rows}, {"PRIJEM", "VYDAJ"})
        self.assertEqual(sum(int(row["transaction_count"]) for row in rows), 3)
        with (source / "district_account_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            districts = list(csv.DictReader(handle))
        self.assertEqual({row["district_id"]: row["distinct_accounts"] for row in districts},
                         {"2": "2", "3": "1"})

    def test_client_account_relationships_reconcile_disposition_bridge(self):
        source = self.directory / "source_tables"
        source.mkdir()
        (source / "client.csv").write_text("client_id\n1\n2\n", encoding="utf-8")
        (source / "account.csv").write_text("account_id\n10\n20\n", encoding="utf-8")
        (source / "disp.csv").write_text(
            "disp_id,client_id,account_id,type\n100,1,10,OWNER\n101,2,10,DISPONENT\n102,2,20,OWNER\n103,1,10,OWNER\n",
            encoding="utf-8",
        )
        from build_analytics import build_client_account_relationships
        result = build_client_account_relationships(self.directory)
        self.assertTrue(result["available"])
        self.assertEqual(result["unique_client_account_pairs"], 3)
        self.assertEqual(result["clients_with_accounts"], 2)
        self.assertEqual(result["accounts_with_clients"], 2)
        self.assertEqual(result["unmatched_client_ids"], 0)
        self.assertEqual(result["unmatched_account_ids"], 0)
        self.assertEqual(result["disposition_rows"], 4)
        self.assertEqual(result["unique_client_account_pairs"], 3)
        with (source / "disposition_type_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            type_rows = list(csv.DictReader(handle))
        self.assertEqual({row["observed_disposition_type"]: row["relationship_count"] for row in type_rows},
                         {"OWNER": "3", "DISPONENT": "1"})
        with (source / "account_client_coverage.csv").open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual({row["account_id"]: row["distinct_clients"] for row in rows}, {"10": "2", "20": "1"})

    def test_district_loan_outcomes_keep_unmapped_and_ambiguous_rows(self):
        source = self.directory / "source_tables"
        source.mkdir()
        (source / "account.csv").write_text(
            "account_id,district_id\n100,1\n200,2\n300,3\n300,4\n", encoding="utf-8"
        )
        from build_analytics import build_district_loan_outcomes
        loans = [
            {"loan_id": "1", "account_id": "100", "amount": "1000", "status": "A"},
            {"loan_id": "2", "account_id": "200", "amount": "2000", "status": "B"},
            {"loan_id": "3", "account_id": "999", "amount": "3000", "status": "A"},
            {"loan_id": "4", "account_id": "300", "amount": "4000", "status": "C"},
        ]
        result = build_district_loan_outcomes(self.directory, loans)
        self.assertEqual(result["loan_rows"], 4)
        self.assertEqual(result["mapped_loan_rows"], 2)
        self.assertEqual(result["unmapped_loan_rows"], 1)
        self.assertEqual(result["ambiguous_account_district_loan_rows"], 1)
        self.assertEqual(result["conflicting_account_district_ids"], 1)
        with (self.directory / "loan_district_outcome_summary.csv").open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(sum(int(row["loan_count"]) for row in rows), 4)
        self.assertIn("<UNMAPPED>", {row["district_id"] for row in rows})
        self.assertIn("<AMBIGUOUS_ACCOUNT_DISTRICT>", {row["district_id"] for row in rows})

    def test_account_activity_requires_matching_source_exports(self):
        from build_analytics import build_account_activity
        result = build_account_activity(self.directory)
        self.assertFalse(result["available"])

    def test_missing_required_source_column_fails(self):
        (self.directory / "loan_analysis_extract.csv").write_text("loan_id,status\n1,A\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "missing columns"):
            build_analytics(self.directory)


    def test_eight_table_relationship_audit_detects_orphans(self):
        from validate_exports import validate_source_relationships
        source = self.directory / "source_tables"
        source.mkdir()
        fixtures = {
            "district": "A1\n1\n",
            "account": "account_id,district_id\n10,1\n",
            "client": "client_id,district_id\n20,1\n",
            "disp": "disp_id,client_id,account_id\nt1,20,10\n",
            "card": "card_id,disp_id\nc1,t1\n",
            "loan": "loan_id,account_id\nl1,10\n",
            "orders": "order_id,account_id\no1,10\n",
            "trans": "trans_id,account_id\nx1,10\n",
        }
        for table, content in fixtures.items():
            (source / f"{table}.csv").write_text(content, encoding="utf-8")
        passed, detail = validate_source_relationships(self.directory)
        self.assertTrue(passed, detail)
        (source / "card.csv").write_text("card_id,disp_id\nc1,missing\n", encoding="utf-8")
        passed, detail = validate_source_relationships(self.directory)
        self.assertFalse(passed)
        self.assertIn("card.disp_id->disp.disp_id: 1", detail)


    def test_scheduled_repayment_summary_is_explicitly_scheduled(self):
        from build_analytics import summarize_scheduled_repayments
        rows = [
            {"loan_id": "1", "amount": "1000", "duration": "10", "payments": "120", "status": "A"},
            {"loan_id": "2", "amount": "2000", "duration": "10", "payments": "180", "status": "A"},
            {"loan_id": "3", "amount": "0", "duration": "10", "payments": "100", "status": "B"},
            {"loan_id": "4", "amount": "500", "duration": "0", "payments": "100", "status": "B"},
        ]
        result = summarize_scheduled_repayments(rows)
        a = next(row for row in result if row["status"] == "A")
        b_valid_schedule = next(
            row for row in result if row["status"] == "B" and row["duration_months"] == "10"
        )
        b_invalid_duration = next(
            row for row in result if row["status"] == "B" and row["duration_months"] == "0"
        )
        self.assertEqual(a["loan_count"], "2")
        self.assertEqual(a["valid_schedule_rows"], "2")
        self.assertEqual(a["average_monthly_installment"], "150.00")
        self.assertEqual(a["average_scheduled_total"], "1500.00")
        self.assertEqual(a["average_scheduled_to_principal_ratio"], "1.05")
        self.assertEqual(b_valid_schedule["loan_count"], "1")
        self.assertEqual(b_valid_schedule["valid_schedule_rows"], "1")
        self.assertEqual(b_valid_schedule["valid_ratio_rows"], "0")
        self.assertEqual(b_invalid_duration["loan_count"], "1")
        self.assertEqual(b_invalid_duration["valid_schedule_rows"], "0")
        self.assertEqual(b_invalid_duration["valid_ratio_rows"], "0")


if __name__ == "__main__":
    unittest.main()
