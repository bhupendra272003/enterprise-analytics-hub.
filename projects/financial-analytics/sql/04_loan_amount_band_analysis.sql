-- PKDD'99 Financial: descriptive loan outcome summary by fixed principal bands.
-- Read-only SELECT. Bands are reporting categories, not risk thresholds.
-- Share denominator is every source loan row, including missing/non-positive values.

WITH loan_bands AS (
    SELECT
        loan_id,
        account_id,
        amount,
        status,
        CASE
            WHEN amount IS NULL THEN '<MISSING>'
            WHEN amount <= 0 THEN '<NONPOSITIVE>'
            WHEN amount <= 50000 THEN '0 < amount <= 50,000'
            WHEN amount <= 100000 THEN '50,000 < amount <= 100,000'
            WHEN amount <= 150000 THEN '100,000 < amount <= 150,000'
            WHEN amount <= 250000 THEN '150,000 < amount <= 250,000'
            ELSE 'amount > 250,000'
        END AS loan_amount_band
    FROM financial.loan
)
SELECT
    loan_amount_band,
    status,
    COUNT(*) AS loan_count,
    COUNT(DISTINCT account_id) AS distinct_accounts,
    ROUND(AVG(amount), 2) AS average_loan_amount,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM financial.loan), 2) AS share_pct
FROM loan_bands
GROUP BY loan_amount_band, status
ORDER BY
    CASE loan_amount_band
        WHEN '<NONPOSITIVE>' THEN 0
        WHEN '0 < amount <= 50,000' THEN 1
        WHEN '50,000 < amount <= 100,000' THEN 2
        WHEN '100,000 < amount <= 150,000' THEN 3
        WHEN '150,000 < amount <= 250,000' THEN 4
        WHEN 'amount > 250,000' THEN 5
        WHEN '<MISSING>' THEN 6
        ELSE 7
    END,
    status;
