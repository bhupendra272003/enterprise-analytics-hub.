"""Offline contract tests for the read-only CTU Financial project pack."""
from pathlib import Path
import csv
import json
import re
import tempfile
import unittest

import validate_exports

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

    def test_offline_analytics_builder_is_documented(self):
        script = (ROOT / "python" / "build_analytics.py").read_text(encoding="utf-8")
        self.assertIn("loan_duration_outcome_summary.csv", script)
        self.assertIn("loan_vintage_outcome_summary.csv", script)
        self.assertIn("loan_amount_outcome_summary.csv", script)
        self.assertIn("def summarize_loans", script)
        self.assertNotIn("mysql.connector", script)
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("python python/build_analytics.py", readme)

    def test_amount_band_sql_and_power_bi_output_are_documented(self):
        sql = (SQL_DIR / "04_loan_amount_band_analysis.sql").read_text(encoding="utf-8")
        self.assertIn("0 < amount <= 50,000", sql)
        self.assertIn("amount > 250,000", sql)
        guide = (ROOT / "POWER_BI_MODEL.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("loan_amount_outcome_summary.csv", guide)
        self.assertIn("loan_amount_outcome_summary.csv", readme)

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
        self.assertIn("manifest.json", script)
        self.assertIn("STAGING", script)
        self.assertNotRegex(script, r"(?i)cursor\.execute\(\s*f?['\"]\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE)\b")

    def test_readme_does_not_commit_dataset_password(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("ctu-relational", readme)
        self.assertIn("export_source_tables.py", readme)


    def test_validator_checks_optional_raw_exports_against_manifest(self):
        script = (ROOT / "python" / "validate_exports.py").read_text(encoding="utf-8")
        self.assertIn("validate_raw_source_exports", script)
        self.assertIn("manifest.json", script)
        self.assertIn("SOURCE_TABLES", script)
        self.assertIn("row_count", script)
        self.assertIn("raw_source_table_exports", script)

    def _write_raw_export_fixture(self, directory: Path) -> dict:
        export_dir = directory / "source_tables"
        export_dir.mkdir(parents=True)
        manifest = {
            "dataset": "financial",
            "read_only": True,
            "tables": {},
        }
        for table in sorted(validate_exports.SOURCE_TABLES):
            columns = ["id", "value"]
            rows = [[1, "sample"], [2, "example"]]
            with (export_dir / f"{table}.csv").open(
                "w", encoding="utf-8-sig", newline=""
            ) as handle:
                writer = csv.writer(handle)
                writer.writerow(columns)
                writer.writerows(rows)
            manifest["tables"][table] = {
                "file": f"{table}.csv",
                "row_count": len(rows),
                "column_count": len(columns),
                "columns": columns,
            }
        (export_dir / "manifest.json").write_text(
            json.dumps(manifest), encoding="utf-8"
        )
        return manifest

    def test_raw_export_manifest_accepts_all_eight_valid_csvs(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            self._write_raw_export_fixture(directory)
            passed, detail = validate_exports.validate_raw_source_exports(directory)
            self.assertTrue(passed, detail)
            self.assertIn("All eight raw CSVs", detail)

    def test_raw_export_manifest_rejects_row_count_mismatch(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            manifest = self._write_raw_export_fixture(directory)
            manifest["tables"]["loan"]["row_count"] = 99
            (directory / "source_tables" / "manifest.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            passed, detail = validate_exports.validate_raw_source_exports(directory)
            self.assertFalse(passed)
            self.assertIn("loan: CSV has 2 rows", detail)

    def test_raw_export_manifest_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            manifest = self._write_raw_export_fixture(directory)
            manifest["tables"]["loan"]["file"] = "../outside.csv"
            (directory / "source_tables" / "manifest.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            passed, detail = validate_exports.validate_raw_source_exports(directory)
            self.assertFalse(passed)
            self.assertIn("filename must be", detail)

    def test_raw_export_validator_allows_manifest_to_be_optional(self):
        with tempfile.TemporaryDirectory() as temp:
            passed, detail = validate_exports.validate_raw_source_exports(Path(temp))
            self.assertTrue(passed)
            self.assertIn("Optional raw source-table export not present", detail)


if __name__ == "__main__":
    unittest.main()
