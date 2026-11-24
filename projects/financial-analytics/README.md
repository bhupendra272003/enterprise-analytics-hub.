# PKDD'99 Financial Analytics — Vyron Project Pack

This is the reproducible real-data analytics project for Bhupendra's Vyron. It uses the public CTU Relational Financial database directly; it does not copy or modify the source database.

## Verified source facts

- Dataset: PKDD'99 Financial (loan application)
- 8 tables, 55 columns, 1,090,086 total rows, 78.8 MB
- 682 loan records: 606 successful and 76 not successful
- Target: loan.status; CTU prediction unit: loan.account_id; prediction timestamp: loan.date
- Missing values exist.
- Source: https://relational.fel.cvut.cz/dataset/Financial

## Connect with MySQL Workbench

- Host: relational.fel.cvut.cz
- Port: 3306
- User: guest
- Password: obtain the current public read-access password from the dataset publisher's official documentation.
- Default schema: financial

These are the dataset publisher's public read-access connection details. Use a read-only connection and never run UPDATE, DELETE, DROP, ALTER, INSERT or REPLACE against the source. Do not place connection details or credentials in browser code, screenshots, or application settings.

## Reproducible local workflow

Run from this project directory:

~~~bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python python/profile_financial.py
python python/export_source_tables.py
python python/build_analytics.py
python python/validate_exports.py
~~~

The profiler prompts for the database user and password; it does not write them to disk. It runs SELECT-only queries. The complete workflow outputs below are produced by the profiler, the offline grouped-analytics builder, and the offline validator:

| Output | Purpose |
|---|---|
| output/source_profile.json | Exact source inventory, key checks, missing-value counts, relationship checks, loan grain and temporal audit |
| output/data_quality_summary.csv | Long-form metric/value table for Power BI |
| output/missing_value_profile.csv | Missing row counts and percentages for every source column |
| output/relationship_integrity.csv | Orphan-row counts for documented foreign-key relationships |
| output/loan_analysis_extract.csv | Loan-grain source extract, retaining loan_id and account_id |
| output/loan_outcome_summary.csv | Loan count, distinct accounts, average amount/duration and share by observed status |
| output/loan_duration_outcome_summary.csv | Descriptive loan counts, distinct accounts, average amount and overall share by duration and observed status |
| output/loan_vintage_outcome_summary.csv | Descriptive loan counts, distinct accounts, average amount and overall share by loan month and observed status |\n| output/loan_scheduled_repayment_summary.csv | Scheduled installment and scheduled-total-to-principal metrics by duration/status; not actual repayments |
| output/loan_prior_features.csv | Transaction aggregates strictly before each loan date, without the target status |
| output/source_tables/*.csv | Full raw-table extracts for all eight source tables, streamed in 10,000-row batches |
| output/source_tables/manifest.json | Export completion marker with UTC timestamp, row counts, column counts and source column names for all eight tables |\n| output/source_tables/account_transaction_activity.csv | Account-by-observed-transaction-type counts and amount summaries; source labels are not reclassified as income/expense |\n| output/source_tables/district_account_summary.csv | Distinct account counts by source district identifier, when district_id is present in account.csv |
| output/validation_report.json | Offline consistency, grain, target-leakage and temporal-boundary validation |
| output/validation_summary.csv | One row per validator check |

The optional raw-table exporter streams each of the eight source tables to separate CSV files under output/source_tables/ in bounded batches; it uses SELECT only and does not load the full transaction table into memory. It stages all eight files first and publishes manifest.json last; treat that manifest as the export completion marker and use its row/column counts when validating a refresh. The grouped analytics builder and export validator are offline and use only the Python standard library. When both raw account.csv and trans.csv exports exist, the builder also creates account_transaction_activity.csv and (when account.district_id exists) district_account_summary.csv under output/source_tables/. These account-level summaries preserve the transaction type labels exactly as observed and report unmatched transaction account IDs; they do not infer income/expense meaning. The builder reads the saved loan extract and never reconnects to MariaDB. When client.csv, account.csv and disp.csv are available, the builder also writes client_account_coverage.csv (accounts per client), account_client_coverage.csv (clients per account), and disposition_type_summary.csv (counts by the source disposition label). It reports unmatched client/account references and duplicate disposition IDs. Disposition labels are preserved as observed; the analysis does not infer legal ownership or primary-holder meaning. A failed check exits with code 1; foreign-key orphan counts are surfaced as warnings so source exceptions are not silently hidden.

## Analysis guardrails

The documented classification task is finished-loan classification (A vs B) at the loan start date. The CTU page warns that ignoring temporal constraints or mixing finished and unfinished outcomes (A/B vs C/D) can produce misleadingly perfect separation. Do not use transactions on or after loan.date as predictors. The Python and SQL as-of extracts use the strict boundary transaction.date < loan.date.

The feature extract deliberately excludes loan.status. It retains loan_id for traceability, while CTU documents account_id as the prediction unit. Review loan_grain_audit and account/date duplicate checks before defining the model split or aggregating to account grain. Loan date is a prediction timestamp and should not be used as a predictor without an explicit modelling decision.

Transaction types are retained as observed categories. Do not label them income/expense until their source semantics are verified. C/D are not automatically treated as bad loans; they are unfinished contracts in the original task description.

## Power BI workflow

1. Run the profiler, build the grouped analytical summaries, then run the offline validator.
2. Load source_profile.json, loan_analysis_extract.csv, loan_prior_features.csv, loan_duration_outcome_summary.csv, loan_vintage_outcome_summary.csv, loan_scheduled_repayment_summary.csv, missing_value_profile.csv, and relationship_integrity.csv into Vyron's Financial Analytics page for local review.
3. Import the CSV outputs into Power BI Desktop.
4. Follow POWER_BI_MODEL.md for relationship cardinality, measures, temporal leakage controls and report pages.
5. Keep source extract date, query version, row counts and validation report with the PBIX deliverable.

## Important limitations

The project pack and browser-local review workflow are implemented in the repository, but this does not mean the CTU MariaDB connection has been run from this automation or from Vyron. The user must run the profiler from a machine with database access and Python dependencies installed. The current Vyron page processes uploaded CSV/JSON locally in the browser; it does not send them to the server. Direct server-side MariaDB integration, secure credential storage, automated Power BI refresh and secure report embedding remain separate platform engineering work.


The offline validator also reconciles the three derived client-account bridge CSVs against every raw disposition row when all three source exports are present. It checks the distinct client/account coverage counts and the full source-row disposition-type counts; incomplete optional raw exports are reported as skipped rather than treated as a pass of live source integrity.


When `output/source_tables/account.csv` is available, the offline builder also creates `loan_district_outcome_summary.csv`, grouping loan counts, distinct accounts, average amount, and share by district and observed status. Accounts with conflicting district assignments are isolated as `<AMBIGUOUS_ACCOUNT_DISTRICT>`; missing account mappings remain `<UNMAPPED>`. The validator reconciles the grouped output back to the loan extract and unique account-to-district mappings.


### Scheduled repayment burden (descriptive)

The offline builder creates `loan_scheduled_repayment_summary.csv`, grouped by loan duration and observed status. It reports loan counts, valid schedule/ratio counts, average monthly installment, arithmetic scheduled total (`payments × duration`), and scheduled-total-to-principal ratio. These are not actual repayments, interest calculations, delinquency, default labels, or credit-risk predictions. Invalid/non-positive duration or principal values are excluded only from the affected metric averages; loan rows remain in group counts. The validator reconciles all grouped metrics to the loan extract.
