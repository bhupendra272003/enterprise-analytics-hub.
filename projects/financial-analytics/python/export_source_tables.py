"""Read-only, chunked CSV export of all CTU Financial source tables.

Run from projects/financial-analytics:
    python python/export_source_tables.py

Credentials are prompted at runtime and never written to disk. Data is streamed
in bounded batches. A manifest is published last as the completion marker.
"""
from __future__ import annotations

import csv
import getpass
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import mysql.connector

HOST = "relational.fel.cvut.cz"
PORT = 3306
DATABASE = "financial"
TABLES = ("account", "client", "disp", "card", "loan", "orders", "trans", "district")
BATCH_SIZE = 10_000
OUTPUT = Path("output/source_tables")
STAGING = OUTPUT / ".staging"


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
    if STAGING.exists():
        shutil.rmtree(STAGING)
    STAGING.mkdir()
    user = input("MariaDB user [guest]: ").strip() or "guest"
    password = getpass.getpass("MariaDB password: ")
    connection = mysql.connector.connect(
        host=HOST, port=PORT, user=user, password=password,
        database=DATABASE, connection_timeout=20,
    )
    manifest = {
        "dataset": DATABASE,
        "host": HOST,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "batch_size": BATCH_SIZE,
        "read_only": True,
        "tables": {},
    }
    try:
        cursor = connection.cursor(dictionary=True, buffered=False)
        for table in TABLES:
            columns = table_columns(cursor, table)
            staged_file = STAGING / f"{table}.csv"
            print(f"Exporting {table} ({len(columns)} columns) in batches of {BATCH_SIZE}…")
            count = stream_table(cursor, table, columns, staged_file)
            manifest["tables"][table] = {
                "file": f"{table}.csv",
                "row_count": count,
                "column_count": len(columns),
                "columns": columns,
            }
            print(f"  {count:,} rows staged")
        cursor.close()
    finally:
        connection.close()

    # Publish data files only after all eight source scans completed.
    for table in TABLES:
        (STAGING / f"{table}.csv").replace(OUTPUT / f"{table}.csv")
    manifest_path = STAGING / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest_path.replace(OUTPUT / "manifest.json")
    STAGING.rmdir()
    print("\nAll eight source tables exported. manifest.json is the completion marker.")
    print(f"Files: {OUTPUT.resolve()}")


if __name__ == "__main__":
    main()
