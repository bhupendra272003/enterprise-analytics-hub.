# Power BI model guide — PKDD'99 Financial

This guide defines a safe model for the profiler's exported source extracts. It does not claim that a PBIX has been created or refreshed.

## Recommended imported tables

| Table | Grain | Suggested key |
|---|---|---|
| loan | One row per source loan | loan_id |
| account | One row per account | account_id |
| client | One row per client | client_id |
| disp | One row per account/client disposition | disp_id |
| district | One row per district | A1 / district identifier from source schema |
| card | One row per issued card | card_id |
| orders | One row per standing order | order_id |
| trans | One row per transaction | trans_id |
| loan_prior_features | One row per loan and observed transaction type | loan_id + transaction_type |
| missing_value_profile | One row per source column | table + column |
| relationship_integrity | One row per documented foreign-key edge | child table + child column + parent table + parent column |

CTU documents account_id as the prediction unit and loan.date as the prediction timestamp. loan_id is retained as the source-row identifier so feature rows can be traced back without collapsing records. Verify loan_grain_audit before defining model splits or changing the target grain.

## Relationships

- account[account_id] → loan[account_id] (one-to-many only after confirming account uniqueness and loan multiplicity).
- loan[loan_id] → loan_prior_features[loan_id] (one-to-many; validate the exported feature grain before creating the relationship).
- account[account_id] → trans[account_id] (one-to-many).
- Link client to account through disp, not by guessing a direct key.
- Link district only after checking the actual district key and cardinality in the source schema.
- Keep loan_prior_features separate until its row grain and relationship key are verified.
- Use relationship_integrity.csv to review orphan references before enabling cross-table measures.

Use single-direction filtering from dimensions to facts where possible. Avoid many-to-many relationships unless the source key structure requires them and the model is documented.

## Reproducible local outputs

Run python python/profile_financial.py from this project directory after installing requirements.txt. It writes:

- output/source_profile.json — exact source table counts, key checks, all-column missing counts, relationship checks, loan grain audit, transaction date-boundary audit and run timestamp.
- output/data_quality_summary.csv — long-form metric/value rows suitable for a Power BI data-quality page.
- output/missing_value_profile.csv — missing counts and percentages for all 55 source columns.
- output/relationship_integrity.csv — orphan counts for documented foreign-key edges.
- output/loan_analysis_extract.csv — loan-grain extract with loan_id and account_id retained.
- output/loan_outcome_summary.csv — loan count, distinct account count, average amount/duration and share by observed status.
- output/loan_prior_features.csv — pre-loan transaction aggregates, grouped by loan_id and observed transaction type; loan.status is excluded.
- output/validation_report.json and output/validation_summary.csv — offline reconciliation, feature-grain, target-leakage and date-boundary checks.

Run python python/validate_exports.py after profiling. It checks the output files without connecting to MariaDB.

## Suggested report pages

1. **Loan outcomes** — loan count by status, share by status, loan amount and duration distributions. Clearly distinguish finished target classes A/B from unfinished C/D outcomes.
2. **Borrower and district profile** — demographic and district attributes after checking the source data dictionary and privacy implications.
3. **Account activity** — transaction counts and amounts by observed transaction type. Do not label transaction types as income/expense until their meanings are confirmed.
4. **Data quality** — missing values, duplicate-key exceptions, orphan references, loan grain audit and transaction date-boundary checks.
5. **Pre-loan activity** — transaction counts, amount and balance aggregates by loan and observed transaction type. Keep the target label out of this table.

## Measures (DAX)

Create measures only after loading and validating the relevant tables:

~~~DAX
Loan Count = COUNTROWS(loan)

Distinct Loan Accounts = DISTINCTCOUNT(loan[account_id])

Average Loan Amount = AVERAGE(loan[amount])

Average Loan Duration (Months) = AVERAGE(loan[duration])
~~~

If the report filters to completed target classes A/B, create an explicitly named filtered measure only after confirming the status labels in the imported data. Do not treat C/D as bad loans without a separately defined business question.

## Temporal leakage controls

- Use transactions strictly earlier than loan.date for as-of features.
- Exclude same-day and post-loan transactions from predictors unless the source task explicitly defines another timestamp convention.
- Keep target loan.status out of loan_prior_features.csv and all model predictor tables.
- Treat loan_date as a prediction timestamp; do not use it as a predictor without an explicit modelling decision.
- Preserve a reproducible source extract date and query version.
- Document row counts before and after every merge; unexpected row multiplication is a model-quality defect.

## Validation checklist

- [ ] Source table row counts match the inventory query.
- [ ] All-column missing-value counts reviewed.
- [ ] Key uniqueness and relationship cardinality verified.
- [ ] Orphan foreign-key references reviewed.
- [ ] Loan account/date grain audit reviewed.
- [ ] Transaction type values and meanings reviewed.
- [ ] Same-day and post-loan transaction counts documented.
- [ ] No target label or post-loan fields included in predictors.
- [ ] Power BI relationship view reviewed for ambiguous paths.

## Power BI implementation contract

### Import only artifacts that exist in the current profiler output

For the current CSV export workflow, begin with these tables:

- `loan_analysis_extract.csv` — one row per source loan; keep `loan_id` as the unique row key.
- `loan_prior_features.csv` — one row per loan and observed transaction type; the key is the composite `loan_id` + `transaction_type`. A blank transaction type can represent a loan with no matching prior transactions.
- `loan_outcome_summary.csv` — pre-aggregated status summary for reconciliation only; do not relate it as another loan fact table.
- `data_quality_summary.csv`, `missing_value_profile.csv`, and `relationship_integrity.csv` — quality/audit tables for the quality page.

The profiler creates the quality and loan-focused extracts. Run `python python/export_source_tables.py` to create full raw CSV extracts for all eight source tables under `output/source_tables/`. Import these raw extracts only when needed for the wider relational report; preserve the exact source column names and validate row counts against `source_profile.json` before modelling.

### Optional full relational model from raw source exports

When the eight `output/source_tables/*.csv` files have been generated and validated, the following source relationships may be created after checking parent-key uniqueness and orphan counts:

- `district[A1]` → `account[ district_id ]` and `client[district_id]` (one-to-many where district key is unique).
- `account[account_id]` → `disp[account_id]`, `loan[account_id]`, `orders[account_id]`, and `trans[account_id]` (one-to-many where account key is unique).
- `client[client_id]` → `disp[client_id]` (one-to-many where client key is unique).
- `disp[disp_id]` → `card[disp_id]` (one-to-many where disposition key is unique).

Use single-direction filtering from dimensions toward facts. Keep `loan` and `trans` as facts; avoid joining raw transaction rows directly to loans in Power Query because that can multiply loan rows. Use the pre-aggregated `loan_prior_features` extract for loan-as-of analysis.

Do not activate a relationship merely because the columns have similar names. First confirm unique parent keys, matching data types, and zero or explicitly reviewed orphan references using the quality exports. These suggested edges are source-schema relationships, not a claim that every current extract has passed live validation.

### Relationships and filter direction

Create one active relationship:

- `loan_analysis_extract[loan_id]` (one) → `loan_prior_features[loan_id]` (many), single-direction from loan to features.

Before activating it, confirm that `loan_analysis_extract[loan_id]` is unique and the feature table has no duplicate `loan_id` + `transaction_type` pairs. Do not relate `loan_outcome_summary` to the loan table; it is a reconciliation aggregate. Keep quality tables disconnected unless a deliberate dimension table is introduced.

### Starter DAX measures

Use these measures with the exact imported table and column names:

```DAX
Loan Rows = COUNTROWS(loan_analysis_extract)

Distinct Loan Accounts =
    DISTINCTCOUNT(loan_analysis_extract[account_id])

Average Loan Amount =
    AVERAGE(loan_analysis_extract[amount])

Average Loan Duration (Months) =
    AVERAGE(loan_analysis_extract[duration])

Successful Finished Loans =
    CALCULATE(
        [Loan Rows],
        loan_analysis_extract[status] = "A"
    )

Not Successful Finished Loans =
    CALCULATE(
        [Loan Rows],
        loan_analysis_extract[status] = "B"
    )

Finished A-B Loans =
    CALCULATE(
        [Loan Rows],
        loan_analysis_extract[status] IN {"A", "B"}
    )

Prior Transactions =
    SUM(loan_prior_features[prior_transaction_count])

Prior Transaction Amount =
    SUM(loan_prior_features[prior_transaction_amount_sum])

Loans With Prior Activity =
    CALCULATE(
        DISTINCTCOUNT(loan_prior_features[loan_id]),
        loan_prior_features[prior_transaction_count] > 0
    )

Relationship Orphan Rows =
    SUM(relationship_integrity[orphan_rows])

Missing Source Values =
    SUM(missing_value_profile[missing_rows])
```

A/B are the finished-loan classes described by the source task. Keep C/D visible as separate observed statuses; do not relabel them as defaults or bad loans. These starter measures are descriptive, not a validated credit-risk model.

### Refresh and reconciliation procedure

1. Preserve the complete `output/` folder from one profiler run; do not mix CSVs from different runs.
2. Import the six CSV artifacts listed above using **Get Data → Text/CSV**.
3. Set `loan_id` and `account_id` to whole number (or a consistent text key if the source connector exports them as text); set dates to Date and amount/balance fields to Decimal Number.
4. Disable automatic relationship detection and create only the documented loan-to-features relationship after checking uniqueness.
5. Compare `[Loan Rows]` with the loan row count in `source_profile.json` and the sum of `loan_outcome_summary[loan_count]`.
6. Compare `[Prior Transactions]` with the sum of `prior_transaction_count` in the exported feature file. A feature row with zero prior transactions is valid and should not be removed.
7. Review `Relationship Orphan Rows`, `Missing Source Values`, the validation report and all temporal checks before interpreting charts.
8. Record the profiler run timestamp, source query/version and validator result alongside the PBIX. Refresh only after replacing the complete output set with a single new run.

### Report acceptance checks

- Loan rows reconcile to the source profile and outcome summary.
- The loan key is unique; feature composite grain is unique.
- Relationship cardinality is one-to-many and filter direction is single.
- C/D are not presented as failed/default loans.
- Prior transaction measures use only the pre-loan extract.
- Target status is not present in the prior-feature table.
- Missingness and orphan counts are visible rather than silently filtered away.
- Report labels state that this is a historical dataset analysis, not current bank performance.

