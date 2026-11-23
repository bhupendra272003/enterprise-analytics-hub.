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
    "account": "account_id", "client": "client_id", "disp": "disp_id",
    "card": "card_id", "loan": "loan_id", "orders": "order_id",
    "trans": "trans_id", "district": "A1",
}
RELATIONSHIPS = (
    ("account", "district_id", "district", "A1"),
    ("client", "district_id", "district", "A1"),
    ("disp", "account_id", "account", "account_id"),
    ("disp", "client_id", "client", "client_id"),
    ("card", "disp_id", "disp", "disp_id"),
    ("loan", "account_id", "account", "account_id"),
    ("orders", "account_id", "account", "account_id"),
    ("trans", "account_id", "account", "account_id"),
)
LOAN_COLUMNS = ("loan_id", "account_id", "date", "amount", "duration", "payments", "status")
FEATURE_COLUMNS = (
    "loan_id", "account_id", "loan_date", "loan_amount", "loan_duration_months",
    "transaction_type", "prior_transaction_count", "prior_transaction_amount_sum",
    "prior_transaction_amount_avg", "prior_balance_avg", "prior_balance_min",
    "prior_balance_max", "first_prior_transaction_date", "latest_prior_transaction_date",
)
OUT = Path("output")


def quote_identifier(value: str) -> str:
    tick = chr(96)
    return tick + value.replace(tick, tick + tick) + tick


def fetch_inventory(cursor) -> list[dict]:
    inventory = []
    for table in TABLES:
        cursor.execute(f"SELECT COUNT(*) AS row_count FROM {quote_identifier(table)}")
        row_count = int(cursor.fetchone()["row_count"])
        cursor.execute(
            "SELECT COUNT(*) AS column_count FROM information_schema.columns "
            "WHERE table_schema=%s AND table_name=%s",
            (DATABASE, table),
        )
        column_count = int(cursor.fetchone()["column_count"])
        inventory.append({"table": table, "rows": row_count, "columns": column_count})
    return inventory


def fetch_key_checks(cursor) -> list[dict]:
    checks = []
    for table, key in KEYS.items():
        cursor.execute(
            f"SELECT COUNT(*) AS row_count, SUM({quote_identifier(key)} IS NULL) AS missing_key "
            f"FROM {quote_identifier(table)}"
        )
        totals = cursor.fetchone()
        cursor.execute(
            f"SELECT COUNT(*) AS duplicate_groups FROM ("
            f"SELECT {quote_identifier(key)} FROM {quote_identifier(table)} "
            f"WHERE {quote_identifier(key)} IS NOT NULL "
            f"GROUP BY {quote_identifier(key)} HAVING COUNT(*) > 1) AS duplicate_keys"
        )
        checks.append({
            "table": table, "key": key, "rows": int(totals["row_count"]),
            "missing_key": int(totals["missing_key"] or 0),
            "duplicate_key_groups": int(cursor.fetchone()["duplicate_groups"]),
        })
    return checks


def fetch_missing_values(cursor) -> tuple[dict[str, int], dict[str, int]]:
    """Count nulls in every source column using metadata-derived identifiers."""
    placeholders = ",".join(["%s"] * len(TABLES))
    cursor.execute(
        "SELECT table_name, column_name FROM information_schema.columns "
        f"WHERE table_schema=%s AND table_name IN ({placeholders}) "
        "ORDER BY table_name, ordinal_position",
        (DATABASE, *TABLES),
    )
    by_table = {table: [] for table in TABLES}
    for row in cursor.fetchall():
        by_table[row["table_name"]].append(row["column_name"])

    missing, table_rows = {}, {}
    for table, columns in by_table.items():
        if not columns:
            continue
        expressions = ", ".join(
            f"SUM({quote_identifier(column)} IS NULL) AS missing_{index}"
            for index, column in enumerate(columns)
        )
        cursor.execute(
            f"SELECT COUNT(*) AS row_count, {expressions} FROM {quote_identifier(table)}"
        )
        counts = cursor.fetchone()
        table_rows[table] = int(counts["row_count"])
        for index, column in enumerate(columns):
            missing[f"{table}.{column}"] = int(counts[f"missing_{index}"] or 0)
    return missing, table_rows


def fetch_relationship_integrity(cursor) -> list[dict]:
    checks = []
    for child, child_key, parent, parent_key in RELATIONSHIPS:
        cursor.execute(
            f"SELECT COUNT(*) AS orphan_rows FROM {quote_identifier(child)} AS c "
            f"LEFT JOIN {quote_identifier(parent)} AS p "
            f"ON c.{quote_identifier(child_key)} = p.{quote_identifier(parent_key)} "
            f"WHERE c.{quote_identifier(child_key)} IS NOT NULL "
            f"AND p.{quote_identifier(parent_key)} IS NULL"
        )
        checks.append({
            "child_table": child, "child_column": child_key,
            "parent_table": parent, "parent_column": parent_key,
            "orphan_rows": int(cursor.fetchone()["orphan_rows"]),
        })
    return checks


def fetch_loan_grain_audit(cursor) -> dict[str, int]:
    queries = {
        "duplicate_loan_id_groups": (
            "SELECT COUNT(*) AS value FROM (SELECT loan_id FROM loan "
            "GROUP BY loan_id HAVING COUNT(*) > 1) q"
        ),
        "duplicate_account_id_groups": (
            "SELECT COUNT(*) AS value FROM (SELECT account_id FROM loan "
            "WHERE account_id IS NOT NULL GROUP BY account_id HAVING COUNT(*) > 1) q"
        ),
        "duplicate_account_date_groups": (
            "SELECT COUNT(*) AS value FROM (SELECT account_id, date FROM loan "
            "GROUP BY account_id, date HAVING COUNT(*) > 1) q"
        ),
    }
    audit = {}
    for name, query in queries.items():
        cursor.execute(query)
        audit[name] = int(cursor.fetchone()["value"])
    return audit


def fetch_temporal_audit(cursor) -> dict[str, int]:
    cursor.execute(
        """
        SELECT COUNT(*) AS matched_transaction_rows,
               SUM(t.date < l.date) AS prior_transaction_matches,
               SUM(t.date = l.date) AS same_day_transaction_matches,
               SUM(t.date > l.date) AS post_loan_transaction_matches
        FROM loan AS l JOIN trans AS t ON t.account_id = l.account_id
        """
    )
    return {key: int(value or 0) for key, value in cursor.fetchone().items()}


def fetch_loan_checks(cursor) -> dict[str, int]:
    cursor.execute(
        """
        SELECT COUNT(*) AS loan_rows,
               SUM(loan_id IS NULL) AS missing_loan_id,
               SUM(account_id IS NULL) AS missing_account_id,
               SUM(date IS NULL) AS missing_loan_date,
               SUM(status IS NULL) AS missing_status,
               SUM(amount IS NULL) AS missing_amount,
               SUM(duration IS NULL) AS missing_duration,
               SUM(amount <= 0) AS non_positive_amount,
               SUM(duration <= 0) AS non_positive_duration,
               SUM(status IS NOT NULL AND status NOT IN ('A','B','C','D')) AS unknown_status
        FROM loan
        """
    )
    return {key: int(value or 0) for key, value in cursor.fetchone().items()}


def fetch_loans(cursor) -> pd.DataFrame:
    cursor.execute(
        "SELECT loan_id, account_id, date, amount, duration, payments, status "
        "FROM loan ORDER BY date, account_id, loan_id"
    )
    return pd.DataFrame(cursor.fetchall(), columns=LOAN_COLUMNS)


def fetch_prior_features(cursor) -> pd.DataFrame:
    """Aggregate only transactions strictly before each loan's start date."""
    cursor.execute(
        """
        SELECT l.loan_id, l.account_id, l.date AS loan_date,
               l.amount AS loan_amount, l.duration AS loan_duration_months,
               t.type AS transaction_type,
               COUNT(t.trans_id) AS prior_transaction_count,
               COALESCE(SUM(t.amount), 0) AS prior_transaction_amount_sum,
               AVG(t.amount) AS prior_transaction_amount_avg,
               AVG(t.balance) AS prior_balance_avg,
               MIN(t.balance) AS prior_balance_min,
               MAX(t.balance) AS prior_balance_max,
               MIN(t.date) AS first_prior_transaction_date,
               MAX(t.date) AS latest_prior_transaction_date
        FROM loan AS l
        LEFT JOIN trans AS t
          ON t.account_id = l.account_id AND t.date < l.date
        GROUP BY l.loan_id, l.account_id, l.date, l.amount, l.duration, t.type
        ORDER BY l.date, l.account_id, l.loan_id, t.type
        """
    )
    return pd.DataFrame(cursor.fetchall(), columns=FEATURE_COLUMNS)


def build_quality_rows(inventory, key_checks, loan_checks, missing_by_column,
                       relationship_checks, grain_audit, temporal_audit) -> list[dict]:
    metrics = []
    for item in inventory:
        metrics.append({"metric": f"rows.{item['table']}", "value": item["rows"]})
    for item in key_checks:
        metrics.extend([
            {"metric": f"missing_key.{item['table']}.{item['key']}", "value": item["missing_key"]},
            {"metric": f"duplicate_key_groups.{item['table']}.{item['key']}", "value": item["duplicate_key_groups"]},
        ])
    for column, value in missing_by_column.items():
        metrics.append({"metric": f"missing_values.{column}", "value": value})
    for item in relationship_checks:
        edge = f"{item['child_table']}.{item['child_column']}->{item['parent_table']}.{item['parent_column']}"
        metrics.append({"metric": f"orphan_rows.{edge}", "value": item["orphan_rows"]})
    for prefix, values in (
        ("loan", loan_checks), ("loan_grain", grain_audit), ("temporal", temporal_audit)
    ):
        for key, value in values.items():
            metrics.append({"metric": f"{prefix}.{key}", "value": value})
    return metrics


def main() -> None:
    OUT.mkdir(exist_ok=True)
    user = input("MariaDB user [guest]: ").strip() or "guest"
    password = getpass.getpass("MariaDB password: ")
    conn = mysql.connector.connect(
        host=HOST, port=PORT, user=user, password=password,
        database=DATABASE, connection_timeout=20,
    )
    try:
        cursor = conn.cursor(dictionary=True)
        print("Profiling source tables and key integrity…")
        inventory = fetch_inventory(cursor)
        key_checks = fetch_key_checks(cursor)
        print("Counting missing values across all source columns…")
        missing_by_column, table_rows = fetch_missing_values(cursor)
        print("Checking documented foreign-key relationships…")
        relationship_checks = fetch_relationship_integrity(cursor)
        loan_checks = fetch_loan_checks(cursor)
        grain_audit = fetch_loan_grain_audit(cursor)
        print("Auditing transaction timing around loan start dates…")
        temporal_audit = fetch_temporal_audit(cursor)
        print("Exporting the loan-grain source extract…")
        loans = fetch_loans(cursor)
        print("Building strictly pre-loan transaction features…")
        prior_features = fetch_prior_features(cursor)
        cursor.close()

        status_counts = loans["status"].value_counts(dropna=False)
        status_distribution = {
            ("<NULL>" if pd.isna(key) else str(key)): int(value)
            for key, value in status_counts.items()
        }
        outcomes = (
            loans.groupby("status", dropna=False)
            .agg(
                loan_count=("status", "size"),
                distinct_accounts=("account_id", "nunique"),
                average_loan_amount=("amount", "mean"),
                average_duration_months=("duration", "mean"),
            )
            .reset_index()
        )
        outcomes["share_pct"] = (
            outcomes["loan_count"] / max(len(loans), 1) * 100
        ).round(2)

        loans.to_csv(OUT / "loan_analysis_extract.csv", index=False)
        outcomes.to_csv(OUT / "loan_outcome_summary.csv", index=False)
        prior_features.to_csv(OUT / "loan_prior_features.csv", index=False)

        missing_rows = []
        for key, missing_count in missing_by_column.items():
            table, column = key.split(".", 1)
            row_count = table_rows.get(table, 0)
            missing_rows.append({
                "table": table, "column": column, "row_count": row_count,
                "missing_rows": missing_count,
                "missing_pct": round(missing_count / row_count * 100, 4) if row_count else 0,
            })
        pd.DataFrame(
            missing_rows,
            columns=["table", "column", "row_count", "missing_rows", "missing_pct"],
        ).to_csv(OUT / "missing_value_profile.csv", index=False)
        pd.DataFrame(relationship_checks).to_csv(
            OUT / "relationship_integrity.csv", index=False
        )
        quality_rows = build_quality_rows(
            inventory, key_checks, loan_checks, missing_by_column,
            relationship_checks, grain_audit, temporal_audit,
        )
        pd.DataFrame(quality_rows).to_csv(OUT / "data_quality_summary.csv", index=False)

        report = {
            "source": f"{HOST}:{PORT}/{DATABASE}",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "inventory": inventory,
            "key_integrity": key_checks,
            "missing_by_table_column": missing_by_column,
            "relationship_integrity": relationship_checks,
            "loan_checks": loan_checks,
            "loan_grain_audit": grain_audit,
            "temporal_audit": temporal_audit,
            "loan_rows_exported": int(len(loans)),
            "feature_rows_exported": int(len(prior_features)),
            "loan_columns": list(loans.columns),
            "feature_columns": list(prior_features.columns),
            "status_distribution": status_distribution,
        }
        (OUT / "source_profile.json").write_text(
            json.dumps(report, indent=2, default=str), encoding="utf-8"
        )
        print(json.dumps(report, indent=2, default=str))
        print(f"\nSaved all source, quality and as-of feature outputs under: {OUT.resolve()}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
