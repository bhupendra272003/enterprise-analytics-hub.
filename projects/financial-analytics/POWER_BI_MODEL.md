# Power BI model guide — PKDD'99 Financial

This guide defines a safe starting model for exported source extracts. It does not claim that a PBIX has been created or refreshed.

## Recommended imported tables

| Table | Grain | Suggested key |
|---|---|---|
| loan | One row per source loan | Confirm the source primary key in Workbench metadata |
| account | One row per account | account_id |
| client | One row per client | client_id |
| disp | One row per account/client disposition | Confirm composite/source key |
| district | One row per district | A1 / district identifier from source schema |
| card | One row per issued card | card_id |
| orders | One row per standing order | order_id |
| trans | One row per transaction | trans_id |
| loan_prior_features | One row per loan and transaction type | account_id + loan_date + transaction_type; validate uniqueness |

Do not assume that `account_id` alone is a unique loan key. The source task describes account-level prediction, but the source may contain multiple loans per account. Run the grain audit in `sql/03_asof_loan_features.sql` before creating relationships.

## Relationships

- `account[account_id]` → `loan[account_id]` (one-to-many only after confirming account uniqueness and loan multiplicity).
- `account[account_id]` → `trans[account_id]` (one-to-many).
- Link client to account through `disp`, not by guessing a direct key.
- Link district only after checking the actual district key and cardinality in the source schema.
- Keep `loan_prior_features` separate until its row grain and relationship key are verified.

Use single-direction filtering from dimensions to facts where possible. Avoid many-to-many relationships unless the source key structure requires them and the model is documented.

## Suggested report pages

1. **Loan outcomes** — loan count by status, share by status, loan amount and duration distributions. Clearly distinguish finished A/B loans from unfinished C/D outcomes if using the documented classification task.
2. **Borrower and district profile** — demographic and district attributes after checking the source data dictionary and privacy implications.
3. **Account activity** — transaction counts and amounts by observed transaction type. Do not label transaction types as income/expense until their meanings are confirmed.
4. **Data quality** — missing values, duplicate-key exceptions, loan grain audit, and transaction date-boundary checks.

## Measures (DAX)

Create measures only after loading and validating the relevant tables:

```DAX
Loan Count = COUNTROWS(loan)

Distinct Loan Accounts = DISTINCTCOUNT(loan[account_id])

Average Loan Amount = AVERAGE(loan[amount])

Average Loan Duration (Months) = AVERAGE(loan[duration])
```

If the report filters to completed target classes A/B, create an explicitly named filtered measure only after confirming the status labels in the imported data. Do not treat C/D as bad loans without a separately defined business question.

## Temporal leakage controls

- Use transactions strictly earlier than `loan.date` for as-of features.
- Exclude same-day and post-loan transactions from predictors unless the source task explicitly defines another timestamp convention.
- Keep target `loan.status` out of feature tables used for model training.
- Preserve a reproducible source extract date and query version.
- Document row counts before and after every merge; unexpected row multiplication is a model-quality defect.

## Validation checklist

- [ ] Source table row counts match the inventory query.
- [ ] Key uniqueness and relationship cardinality verified.
- [ ] Loan account/date grain audit reviewed.
- [ ] Transaction type values and meanings reviewed.
- [ ] Same-day and post-loan transaction counts documented.
- [ ] Null counts and status distribution reconciled to source.
- [ ] No post-loan fields included in predictors.
- [ ] Power BI relationship view reviewed for ambiguous paths.
