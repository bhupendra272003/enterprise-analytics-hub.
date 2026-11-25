import csv
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(__file__), "clean_dataset.py")

class CleaningEngineTests(unittest.TestCase):
    def run_engine(self, source_text, options):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        source = os.path.join(temp.name, "source.csv")
        output = os.path.join(temp.name, "cleaned.csv")
        with open(source, "w", encoding="utf-8", newline="") as handle:
            handle.write(source_text)
        result = subprocess.run(
            [sys.executable, SCRIPT, source, output, json.dumps(options)],
            capture_output=True, text=True, check=False
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        with open(output, "r", encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        return json.loads(result.stdout), rows

    def test_trim_duplicate_removal_and_zero_fill(self):
        report, rows = self.run_engine(
            "name,amount\n Alice ,10\nAlice,10\nBob,\n",
            {"trimWhitespace": True, "removeDuplicates": True, "fillMissing": "zero"}
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["name"], "Alice")
        self.assertEqual(rows[1]["amount"], "0")
        self.assertEqual(report["removedDuplicates"], 1)
        self.assertEqual(report["filledCells"], 1)
        self.assertLessEqual(report["before"]["qualityScore"], 100)
        self.assertGreaterEqual(report["after"]["qualityScore"], 0)

    def test_mean_fill_and_outlier_detection(self):
        report, rows = self.run_engine(
            "value\n1\n2\n3\n4\n1000\n",
            {"trimWhitespace": True, "removeDuplicates": True, "fillMissing": "mean"}
        )
        self.assertEqual(len(rows), 5)
        self.assertIn("value", report["outliersByColumn"])
        self.assertEqual(report["removedDuplicates"], 0)


    def test_outlier_quartiles_exclude_middle_value_for_odd_sample(self):
        report, rows = self.run_engine(
            "value\\n1\\n2\\n3\\n4\\n5\\n6\\n100\\n",
            {"trimWhitespace": True, "removeDuplicates": False, "fillMissing": "none"}
        )
        self.assertEqual(len(rows), 6)
        self.assertEqual(report["outliersByColumn"].get("value"), 1)

    def test_rejects_empty_data(self):
        with tempfile.TemporaryDirectory() as temp:
            source = os.path.join(temp, "source.csv")
            output = os.path.join(temp, "cleaned.csv")
            with open(source, "w", encoding="utf-8") as handle:
                handle.write("id,name\n")
            result = subprocess.run(
                [sys.executable, SCRIPT, source, output, "{}"],
                capture_output=True, text=True, check=False
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("at least one data row", result.stderr)

if __name__ == "__main__":
    unittest.main()
