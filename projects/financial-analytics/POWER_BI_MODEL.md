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
