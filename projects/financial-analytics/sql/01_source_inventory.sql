-- PKDD'99 Financial: read-only source inventory
-- Run against the CTU Financial schema. SELECT statements only.
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'financial' AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'financial'
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Exact counts (may take longer than TABLE_ROWS estimates).
SELECT 'account' AS table_name, COUNT(*) AS row_count FROM financial.account
UNION ALL SELECT 'client', COUNT(*) FROM financial.client
UNION ALL SELECT 'disp', COUNT(*) FROM financial.disp
UNION ALL SELECT 'card', COUNT(*) FROM financial.card
UNION ALL SELECT 'loan', COUNT(*) FROM financial.loan
UNION ALL SELECT 'orders', COUNT(*) FROM financial.orders
UNION ALL SELECT 'trans', COUNT(*) FROM financial.trans
UNION ALL SELECT 'district', COUNT(*) FROM financial.district
ORDER BY table_name;

-- Loan target distribution: inspect actual labels before defining a model.
SELECT status, COUNT(*) AS loans
FROM financial.loan
GROUP BY status
ORDER BY status;

-- Null checks for the target and its prediction timestamp / entity.
SELECT
  SUM(status IS NULL) AS missing_status,
  SUM(date IS NULL) AS missing_loan_date,
  SUM(account_id IS NULL) AS missing_account_id
FROM financial.loan;


-- Transaction categories: do not assume a two-category inflow/outflow mapping.
SELECT type, COUNT(*) AS transaction_count,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM financial.trans), 2) AS pct
FROM financial.trans
GROUP BY type
ORDER BY transaction_count DESC;

-- Duplicate checks for documented business identifiers.
-- These queries report exceptions; they do not alter source records.
SELECT 'account_id' AS key_name, COUNT(*) AS duplicate_groups
FROM (
  SELECT account_id FROM financial.account
  GROUP BY account_id HAVING COUNT(*) > 1
) d
UNION ALL
SELECT 'client_id', COUNT(*) FROM (
  SELECT client_id FROM financial.client
  GROUP BY client_id HAVING COUNT(*) > 1
) d
UNION ALL
SELECT 'loan_id', COUNT(*) FROM (
  SELECT loan_id FROM financial.loan
  GROUP BY loan_id HAVING COUNT(*) > 1
) d;
