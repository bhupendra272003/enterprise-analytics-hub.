"""Read-only inventory and lightweight profiling for CTU Financial.

Credentials are prompted interactively and never written to disk.
The script does not modify the source database.
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
OUT = Path("output")
OUT.mkdir(exist_ok=True)


def main() -> None:
    user = input("MariaDB user [guest]: ").strip() or "guest"
    password = getpass.getpass("MariaDB password: ")
    conn = mysql.connector.connect(
        host=HOST, port=PORT, user=user, password=password,
        database=DATABASE, connection_timeout=20,
    )
    try:
        cursor = conn.cursor()
        inventory = []
        for table in TABLES:
            cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
            count = int(cursor.fetchone()[0])
            cursor.execute(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema=%s AND table_name=%s",
                (DATABASE, table),
            )
            columns = int(cursor.fetchone()[0])
            inventory.append({"table": table, "rows": count, "columns": columns})
        cursor.close()

        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT status, date, duration, amount, account_id FROM loan"
        )
        loan_rows = cursor.fetchall()
        cursor.close()
        loans = pd.DataFrame(
            loan_rows,
            columns=["status", "date", "duration", "amount", "account_id"],
        )
        report = {
            "source": f"{HOST}:{PORT}/{DATABASE}",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "inventory": inventory,
            "loan_rows": int(len(loans)),
            "loan_columns": list(loans.columns),
            "missing_by_column": {
                str(k): int(v) for k, v in loans.isna().sum().items()
            },
            "status_distribution": {
                str(k): int(v) for k, v in loans["status"].value_counts(dropna=False).items()
            },
            "date_min": str(loans["date"].min()),
            "date_max": str(loans["date"].max()),
            "duration_min": None if loans["duration"].dropna().empty else int(loans["duration"].min()),
            "duration_max": None if loans["duration"].dropna().empty else int(loans["duration"].max()),
        }
        (OUT / "source_profile.json").write_text(
            json.dumps(report, indent=2, default=str), encoding="utf-8"
        )
        # Small, explicitly scoped analysis extract for downstream Power BI.
        # It contains loan-level fields only; it is not the full raw source.
        loans.to_csv(OUT / "loan_analysis_extract.csv", index=False)
        print(json.dumps(report, indent=2, default=str))
        print(f"\\nSaved profile and loan extract under: {OUT.resolve()}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
