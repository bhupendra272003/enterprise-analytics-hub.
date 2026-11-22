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
