-- PKDD'99 Financial: descriptive analysis of loan outcomes
-- SELECT-only. Validate labels and schema before modelling.
-- The documented target task is finished-loan A vs B at loan start date.

SELECT status, COUNT(*) AS loan_count,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM financial.loan), 2) AS pct
FROM financial.loan
GROUP BY status
ORDER BY status;

SELECT
  COUNT(*) AS total_loans,
  COUNT(DISTINCT account_id) AS distinct_accounts,
  MIN(date) AS first_loan_date,
  MAX(date) AS last_loan_date,
  MIN(duration) AS min_duration_months,
  MAX(duration) AS max_duration_months,
  AVG(amount) AS avg_loan_amount
FROM financial.loan;

-- Outcome by duration. Interpret as descriptive, not causal.
SELECT duration, status, COUNT(*) AS loan_count,
       ROUND(AVG(amount), 2) AS avg_loan_amount
FROM financial.loan
GROUP BY duration, status
ORDER BY duration, status;

-- Account-level loan history; use only if the project definition permits
-- multiple loans per account.
SELECT account_id, COUNT(*) AS loan_count,
       MIN(date) AS first_loan_date, MAX(date) AS latest_loan_date
FROM financial.loan
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY loan_count DESC, account_id
LIMIT 100;

-- Loan-level prior-transaction features are maintained separately in
-- sql/03_asof_loan_features.sql. That query preserves loan_id and groups
-- observed transaction types instead of assuming a fixed income/expense map.
-- It uses t.date < l.date to prevent same-day and post-loan leakage.
