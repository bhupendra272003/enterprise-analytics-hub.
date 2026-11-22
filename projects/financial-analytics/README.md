# PKDD'99 Financial Analytics — Vyron Project Pack

This is the first real-data project pack for Bhupendra's Vyron. It uses the public CTU Relational Financial database directly; it does not copy or modify the source database.

## Verified source facts

- Dataset: PKDD'99 Financial (loan application)
- 8 tables, 55 columns, 1,090,086 total rows, 78.8 MB
- 682 loan records: 606 successful and 76 not successful
- Target: loan.status; prediction unit: loan.account_id; prediction time: loan.date
- Missing values exist.
- Source: https://relational.fel.cvut.cz/dataset/Financial

## Connect with MySQL Workbench

- Host: relational.fel.cvut.cz
- Port: 3306
- User: guest
- Password: ctu-relational
- Default schema: financial

These are public read-access source credentials. Do not save them in Vyron's browser code, repository secrets, or screenshots. Use a read-only connection and never run UPDATE, DELETE, DROP, ALTER, or INSERT against the source.

## Start

1. Open MySQL Workbench and create the connection above.
2. Select schema financial.
3. Run sql/01_source_inventory.sql.
4. Run sql/02_loan_outcome_analysis.sql.
5. Run sql/03_asof_loan_features.sql and review its loan-grain and time-boundary audits.
6. Run the Python inventory/profile script from this project directory:
   ```bash
   python -m venv .venv
   # Windows: .venv\\Scripts\\activate
   # macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   python python/profile_financial.py
   ```
7. Review output/data_quality_summary.csv, output/loan_outcome_summary.csv, and output/loan_analysis_extract.csv.
8. Export the approved as-of feature query result separately, then follow POWER_BI_MODEL.md to build the model and report.

## Analysis guardrails

The documented prediction task is finished-loan classification (A vs B) at the loan start date. Do not use transactions or balances recorded after loan.date as predictors. The source documentation warns that ignoring the temporal constraint can create misleadingly perfect separation. Do not mix unfinished outcomes (C/D) into the finished-loan A/B target without explicitly changing the problem definition.

## Deliverables to record

- Source inventory and row counts
- Missing-value and key-integrity report
- Loan outcome distribution
- Account/transaction activity features calculated strictly as-of loan date
- Power BI report with loan outcomes, customer/district profile, and risk indicators
- Methodology, limitations, and reproducible SQL/Python scripts

## Important

This project pack is implemented in the repository, but it is not a live MariaDB connector inside Vyron yet. The current Vyron Data Workspace accepts CSV uploads. Direct server-side MariaDB integration, secure credential storage, and Power BI refresh/embed remain separate platform engineering work.
