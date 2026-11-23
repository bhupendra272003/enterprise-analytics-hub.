# Vyron live demo dataset

This is a **synthetic practice dataset**, not customer or client data. It is designed to demonstrate the Data Workspace workflow safely.

## File

- `logistics_orders_demo.csv` — 30 order records with intentional quality issues.

## Five-minute walkthrough

1. Sign in to the live Vyron app and create/select an organization where your account has the **OWNER** role.
2. Open **Data Workspace** and upload `logistics_orders_demo.csv`.
3. Inspect the preview and run **Quick profile**.
4. Configure validation rules:
   - Required: `order_id`, `order_date`, `region`, `shipping_mode`
   - Unique: `order_id`
   - Numeric: `delivery_days`, `order_value`
   - Minimum numeric range: `order_value >= 0`
5. Run validation and review missing values, duplicate IDs and invalid amounts.
6. Use **Clean & save version** with a deliberate missing-value strategy. The cleaner creates a new version; the original version remains in history.
7. Upload a second edited CSV or clean the dataset, then compare versions and run anomaly detection.
8. Export the quality report CSV.

## What this demonstrates

- CSV ingestion and preview
- Column profiling and missing-value inspection
- Configurable validation rules
- Non-destructive cleaning with version history
- Version comparison and anomaly review
- Exportable quality reporting

Do not present the synthetic rows as real business results. Use the CTU PKDD'99 Financial case study for the separate public-source SQL/Python/Power BI analytics workflow.
