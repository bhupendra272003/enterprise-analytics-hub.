-- PKDD'99 Financial: leakage-safe, loan-level transaction features.
-- Read-only SELECTs. Run only after checking the transaction type distribution
-- from 01_source_inventory.sql. No transaction category is silently discarded.
--
-- Feature window is strictly before the loan date (<), not on or after it.
-- Output grain: one row per loan/account/date/transaction type.
-- Aggregate this output in Python/Power BI only after validating type semantics.

SELECT
    l.account_id,
    l.date AS loan_date,
    l.status AS loan_status,
    l.duration AS loan_duration_months,
    l.amount AS loan_amount,
    t.type AS transaction_type,
    COUNT(t.trans_id) AS prior_transaction_count,
    COALESCE(SUM(t.amount), 0) AS prior_transaction_amount_sum,
    AVG(t.amount) AS prior_transaction_amount_avg,
    AVG(t.balance) AS prior_balance_avg,
    MIN(t.balance) AS prior_balance_min,
    MAX(t.balance) AS prior_balance_max,
    MIN(t.date) AS first_prior_transaction_date,
    MAX(t.date) AS latest_prior_transaction_date
FROM financial.loan AS l
LEFT JOIN financial.trans AS t
    ON t.account_id = l.account_id
   AND t.date < l.date
GROUP BY
    l.account_id, l.date, l.status, l.duration, l.amount, t.type
ORDER BY l.date, l.account_id, t.type;

-- Audit for same-day and future transactions. These counts are intentionally
-- excluded from the feature query above and help document the time boundary.
SELECT
    COUNT(*) AS total_loan_transaction_account_matches,
    SUM(t.date = l.date) AS same_day_transaction_matches,
    SUM(t.date > l.date) AS post_loan_transaction_matches
FROM financial.loan AS l
JOIN financial.trans AS t
  ON t.account_id = l.account_id;

-- Loan-level grain audit: this query should return no rows if account/date
-- uniquely identifies a loan in this dataset. If it returns rows, use loan
-- primary key as the grain and preserve multiple loans for an account.
SELECT account_id, date, COUNT(*) AS loans_at_same_account_date
FROM financial.loan
GROUP BY account_id, date
HAVING COUNT(*) > 1
ORDER BY loans_at_same_account_date DESC;
