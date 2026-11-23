"""Offline contract tests for the read-only CTU Financial project pack."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "sql"


def sql_without_comments(source: str) -> str:
    source = re.sub(r"--.*?$", "", source, flags=re.MULTILINE)
    return re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)


class FinancialProjectAssetTests(unittest.TestCase):
    def test_sql_assets_are_read_only(self):
        for path in sorted(SQL_DIR.glob("*.sql")):
            sql = sql_without_comments(path.read_text(encoding="utf-8"))
            self.assertIsNone(
                re.search(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE)\b", sql, re.I),
                f"{path.name} must remain SELECT-only",
            )

    def test_asof_features_keep_source_loan_grain_and_exclude_target(self):
        sql = sql_without_comments(
            (SQL_DIR / "03_asof_loan_features.sql").read_text(encoding="utf-8")
        )
        feature_query = sql.split("SELECT", 1)[1].split(";", 1)[0]
        self.assertIn("l.loan_id", feature_query)
        self.assertIn("t.date < l.date", feature_query)
        self.assertIn("GROUP BY", feature_query)
        self.assertNotIn("l.status", feature_query)
        self.assertNotIn("loan_status", feature_query)
        self.assertNotRegex(feature_query, r"t\.date\s*(>=|>)\s*l\.date")

    def test_descriptive_query_does_not_hardcode_transaction_types(self):
        sql = (SQL_DIR / "02_loan_outcome_analysis.sql").read_text(encoding="utf-8")
        self.assertNotIn("PRIJEM", sql)
        self.assertNotIn("VYDAJ", sql)
        self.assertIn("03_asof_loan_features.sql", sql)

    def test_power_bi_feature_grain_uses_loan_id(self):
        guide = (ROOT / "POWER_BI_MODEL.md").read_text(encoding="utf-8")
        self.assertIn("loan_id + transaction_type", guide)
        self.assertIn("loan[loan_id]", guide)
        self.assertIn("account_id", guide)

    def test_python_profiler_covers_all_table_nulls_and_relationships(self):
        script = (ROOT / "python" / "profile_financial.py").read_text(encoding="utf-8")
        self.assertIn("fetch_missing_values", script)
        self.assertIn("fetch_relationship_integrity", script)
        self.assertIn("loan_prior_features.csv", script)
        self.assertIn("getpass.getpass", script)
        self.assertNotIn("ctu-relational", script)

    def test_python_script_does_not_embed_database_password(self):
        script = (ROOT / "python" / "profile_financial.py").read_text(encoding="utf-8")
        self.assertNotIn("ctu-relational", script)
        self.assertIn("data_quality_summary.csv", script)


    def test_raw_source_exporter_is_chunked_and_read_only(self):
        script = (ROOT / "python" / "export_source_tables.py").read_text(encoding="utf-8")
        self.assertIn("fetchmany(batch_size)", script)
        self.assertIn("BATCH_SIZE = 10_000", script)
        self.assertIn("getpass.getpass", script)
        self.assertIn("SELECT", script.upper())
        self.assertIn("source_tables", script)
        self.assertNotRegex(script, r"(?i)\\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE)\\b")

    def test_readme_does_not_commit_dataset_password(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("ctu-relational", readme)
        self.assertIn("export_source_tables.py", readme)


if __name__ == "__main__":
    unittest.main()
