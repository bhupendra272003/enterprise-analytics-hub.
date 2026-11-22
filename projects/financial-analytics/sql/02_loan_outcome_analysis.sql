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
-- multiple loans per account. Do not use post-loan transactions as predictors.
SELECT account_id, COUNT(*) AS loan_count,
       MIN(date) AS first_loan_date, MAX(date) AS latest_loan_date
FROM financial.loan
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY loan_count DESC, account_id
LIMIT 100;

-- Transaction aggregates strictly before each loan date.
-- These are safe as-of features only if transaction dates are validated
-- and no future-dated or same-day leakage is introduced.
SELECT l.account_id, l.date AS loan_date, l.status,
       COUNT(t.trans_id) AS prior_transaction_count,
       SUM(CASE WHEN t.type = 'PRIJEM' THEN t.amount ELSE 0 END) AS prior_incoming_amount,
       SUM(CASE WHEN t.type = 'VYDAJ' THEN t.amount ELSE 0 END) AS prior_outgoing_amount,
       AVG(t.balance) AS avg_prior_balance,
       MIN(t.balance) AS min_prior_balance
FROM financial.loan l
LEFT JOIN financial.trans t
  ON t.account_id = l.account_id
 AND t.date < l.date
GROUP BY l.account_id, l.date, l.status
ORDER BY l.date, l.account_id;

-- IMPORTANT: Validate transaction type values and the transaction primary key
-- against information_schema before relying on the feature query above.
