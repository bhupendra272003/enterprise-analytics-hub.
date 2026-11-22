"""Read-only inventory, data-quality checks and loan extracts for CTU Financial.

Credentials are prompted interactively and never written to disk.
The script runs SELECT statements only and does not modify the source database.
Run from the projects/financial-analytics directory.
"""
from __future__ import annotations

import getpass
import json
from datetime import datetime, timezone
from pathlib import Path

import mysql.connector
import pandas as pd

HOST = "relational.fel.cvut.cz"
PORT = 3306
DATABASE = "financial"
TABLES = ("account", "client", "disp", "card", "loan", "orders", "trans", "district")
KEYS = {
    "account": "account_id",
    "client": "client_id",
    "disp": "disp_id",
    "card": "card_id",
    "loan": "loan_id",
    "orders": "order_id",
    "trans": "trans_id",
    "district": "A1",
}
OUT = Path("output")


def fetch_inventory(cursor) -> list[dict]:
    inventory = []
    for table in TABLES:
        cursor.execute(f"SELECT COUNT(*) AS row_count FROM `{table}`")
        row_count = int(cursor.fetchone()["row_count"])
        cursor.execute(
            "SELECT COUNT(*) AS column_count FROM information_schema.columns "
            "WHERE table_schema=%s AND table_name=%s",
            (DATABASE, table),
        )
        column_count = int(cursor.fetchone()["column_count"])
        inventory.append(
            {"table": table, "rows": row_count, "columns": column_count}
        )
    return inventory


def fetch_key_checks(cursor) -> list[dict]:
    checks = []
    for table, key in KEYS.items():
        cursor.execute(
            f"SELECT COUNT(*) AS row_count, "
            f"SUM(`{key}` IS NULL) AS missing_key "
            f"FROM `{table}`"
        )
        totals = cursor.fetchone()
        cursor.execute(
            f"SELECT COUNT(*) AS duplicate_groups FROM ("
            f"SELECT `{key}` FROM `{table}` "
            f"WHERE `{key}` IS NOT NULL GROUP BY `{key}` "
            f"HAVING COUNT(*) > 1) AS duplicate_keys"
        )
        duplicate_groups = int(cursor.fetchone()["duplicate_groups"])
        checks.append(
            {
                "table": table,
                "key": key,
                "rows": int(totals["row_count"]),
                "missing_key": int(totals["missing_key"] or 0),
                "duplicate_key_groups": duplicate_groups,
            }
        )
    return checks


def fetch_loan_checks(cursor) -> dict:
    cursor.execute(
        """
        SELECT
            COUNT(*) AS loan_rows,
            SUM(loan_id IS NULL) AS missing_loan_id,
            SUM(account_id IS NULL) AS missing_account_id,
            SUM(date IS NULL) AS missing_loan_date,
            SUM(status IS NULL) AS missing_status,
            SUM(amount IS NULL) AS missing_amount,
            SUM(duration IS NULL) AS missing_duration,
            SUM(amount <= 0) AS non_positive_amount,
            SUM(duration <= 0) AS non_positive_duration
        FROM loan
        """
    )
    result = cursor.fetchone()
    return {key: int(value or 0) for key, value in result.items()}


def fetch_loans(cursor) -> pd.DataFrame:
    cursor.execute(
        """
        SELECT loan_id, account_id, date, amount, duration, payments, status
        FROM loan
        ORDER BY date, account_id, loan_id
        """
    )
    rows = cursor.fetchall()
    return pd.DataFrame(
        rows,
        columns=[
            "loan_id",
            "account_id",
            "date",
            "amount",
            "duration",
            "payments",
            "status",
        ],
    )


def build_quality_rows(inventory: list[dict], key_checks: list[dict],
                       loan_checks: dict, missing_by_column: dict) -> list[dict]:
    metrics = []
    for item in inventory:
        metrics.append(
            {"metric": f"rows.{item['table']}", "value": item["rows"]}
        )
    for item in key_checks:
        metrics.extend(
            [
                {
                    "metric": f"missing_key.{item['table']}.{item['key']}",
                    "value": item["missing_key"],
                },
                {
                    "metric": f"duplicate_key_groups.{item['table']}.{item['key']}",
                    "value": item["duplicate_key_groups"],
                },
            ]
        )
    for key, value in loan_checks.items():
        metrics.append({"metric": f"loan.{key}", "value": value})
    for column, value in missing_by_column.items():
        metrics.append({"metric": f"loan_missing.{column}", "value": value})
    return metrics


def main() -> None:
    OUT.mkdir(exist_ok=True)
    user = input("MariaDB user [guest]: ").strip() or "guest"
    password = getpass.getpass("MariaDB password: ")
    conn = mysql.connector.connect(
        host=HOST,
        port=PORT,
        user=user,
        password=password,
        database=DATABASE,
        connection_timeout=20,
    )
    try:
        cursor = conn.cursor(dictionary=True)
        inventory = fetch_inventory(cursor)
        key_checks = fetch_key_checks(cursor)
        loan_checks = fetch_loan_checks(cursor)
        loans = fetch_loans(cursor)
        cursor.close()

        missing_by_column = {
            str(key): int(value)
            for key, value in loans.isna().sum().items()
        }
        status_counts = loans["status"].value_counts(dropna=False)
        status_distribution = {
            ("<NULL>" if pd.isna(key) else str(key)): int(value)
            for key, value in status_counts.items()
        }
        outcomes = (
            loans.groupby("status", dropna=False)
            .agg(
                loan_count=("loan_id", "count"),
                average_loan_amount=("amount", "mean"),
                average_duration_months=("duration", "mean"),
            )
            .reset_index()
        )
        outcomes["share_pct"] = (
            outcomes["loan_count"] / max(len(loans), 1) * 100
        ).round(2)
        outcomes.to_csv(OUT / "loan_outcome_summary.csv", index=False)
        loans.to_csv(OUT / "loan_analysis_extract.csv", index=False)

        quality_rows = build_quality_rows(
            inventory, key_checks, loan_checks, missing_by_column
        )
        pd.DataFrame(quality_rows).to_csv(
            OUT / "data_quality_summary.csv", index=False
        )
        report = {
            "source": f"{HOST}:{PORT}/{DATABASE}",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "inventory": inventory,
            "key_integrity": key_checks,
            "loan_checks": loan_checks,
            "loan_rows_exported": int(len(loans)),
            "loan_columns": list(loans.columns),
            "missing_by_column": missing_by_column,
            "status_distribution": status_distribution,
            "date_min": None if loans["date"].dropna().empty else str(loans["date"].min()),
            "date_max": None if loans["date"].dropna().empty else str(loans["date"].max()),
        }
        (OUT / "source_profile.json").write_text(
            json.dumps(report, indent=2, default=str), encoding="utf-8"
        )
        print(json.dumps(report, indent=2, default=str))
        print(f"\nSaved profile, quality summary and loan extracts under: {OUT.resolve()}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
