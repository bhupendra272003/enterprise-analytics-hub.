"""Read-only, chunked CSV export of all CTU Financial source tables.

Run from projects/financial-analytics:
    python python/export_source_tables.py

The script uses SELECT only, prompts for credentials, streams rows in bounded
batches, and writes one CSV per source table under output/source_tables/.
It never writes credentials or modifies the MariaDB source.
"""
from __future__ import annotations

import csv
import getpass
from pathlib import Path

import mysql.connector

HOST = "relational.fel.cvut.cz"
PORT = 3306
DATABASE = "financial"
TABLES = ("account", "client", "disp", "card", "loan", "orders", "trans", "district")
BATCH_SIZE = 10_000
OUTPUT = Path("output/source_tables")


def quote_identifier(value: str) -> str:
    return "`" + value.replace("`", "``") + "`"


def table_columns(cursor, table: str) -> list[str]:
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position",
        (DATABASE, table),
    )
    return [row["column_name"] for row in cursor.fetchall()]


def stream_table(cursor, table: str, columns: list[str], destination: Path,
                 batch_size: int = BATCH_SIZE) -> int:
    if not columns:
        raise ValueError(f"No columns discovered for source table {table!r}.")
    select_columns = ", ".join(quote_identifier(column) for column in columns)
    cursor.execute(f"SELECT {select_columns} FROM {quote_identifier(table)}")
    written = 0
    with destination.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        while True:
            batch = cursor.fetchmany(batch_size)
            if not batch:
                break
            for record in batch:
                writer.writerow([record.get(column) for column in columns])
            written += len(batch)
    return written


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    user = input("MariaDB user [guest]: ").strip() or "guest"
    password = getpass.getpass("MariaDB password: ")
    connection = mysql.connector.connect(
        host=HOST, port=PORT, user=user, password=password,
        database=DATABASE, connection_timeout=20,
    )
    try:
        cursor = connection.cursor(dictionary=True, buffered=False)
        totals = {}
        for table in TABLES:
            columns = table_columns(cursor, table)
            target = OUTPUT / f"{table}.csv"
            print(f"Exporting {table} ({len(columns)} columns) in batches of {BATCH_SIZE}…")
            totals[table] = stream_table(cursor, table, columns, target)
            print(f"  {totals[table]:,} rows → {target}")
        cursor.close()
        print("\nSource export complete (read-only SELECT workflow).")
        for table, count in totals.items():
            print(f"{table}: {count:,}")
        print(f"Files: {OUTPUT.resolve()}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
