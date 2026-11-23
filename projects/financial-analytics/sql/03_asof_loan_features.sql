-- PKDD'99 Financial: leakage-safe, loan-level transaction features.
-- Read-only SELECTs. Run 01_source_inventory.sql first to inspect categories.
--
-- Feature window is strictly before the loan date (<), not on or after it.
-- Output grain: one row per source loan and observed transaction type.
-- loan_id is retained for row-level traceability. The target label loan.status
-- is deliberately excluded from this feature extract.
-- The prediction unit documented by CTU is account_id; verify account grain
-- before building a model or changing the prediction unit.

SELECT
    l.loan_id,
    l.account_id,
    l.date AS loan_date,
    l.amount AS loan_amount,
    l.duration AS loan_duration_months,
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
    l.loan_id, l.account_id, l.date, l.amount, l.duration, t.type
ORDER BY l.date, l.account_id, l.loan_id, t.type;

-- Audit for same-day and future transactions. These counts are intentionally
-- excluded from the feature query above and help document the time boundary.
SELECT
    COUNT(*) AS total_loan_transaction_account_matches,
    SUM(t.date < l.date) AS prior_transaction_matches,
    SUM(t.date = l.date) AS same_day_transaction_matches,
    SUM(t.date > l.date) AS post_loan_transaction_matches
FROM financial.loan AS l
JOIN financial.trans AS t
  ON t.account_id = l.account_id;

-- Loan-level grain audit: this query should return no rows if loan_id is unique.
SELECT loan_id, COUNT(*) AS duplicate_loan_id_rows
FROM financial.loan
GROUP BY loan_id
HAVING COUNT(*) > 1
ORDER BY duplicate_loan_id_rows DESC;

-- CTU identifies account_id as the prediction unit. Check whether any account
-- has multiple loan rows before deciding how to split or aggregate the target.
SELECT account_id, COUNT(*) AS loans_per_account
FROM financial.loan
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY loans_per_account DESC, account_id;

-- Account/date is not assumed to be a unique loan key. Review any rows returned.
SELECT account_id, date, COUNT(*) AS loans_at_same_account_date
FROM financial.loan
GROUP BY account_id, date
HAVING COUNT(*) > 1
ORDER BY loans_at_same_account_date;
