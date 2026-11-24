# Analytics Studio — Execution and Governance

## SQL Studio
SQL Studio runs queries against the single dataset selected in the workspace. The Worker re-reads that dataset from private organization-scoped storage after validating the user's active membership. Only OWNER, LEADER and ANALYST can execute queries; MANAGER remains read-only.

The current query engine is a bounded CSV query engine, not a general-purpose connection to the D1 control database. It supports one read-only SELECT statement, column selection and `SELECT DISTINCT` for projected values; COUNT/SUM/AVG/MIN/MAX; WHERE comparisons (`=`, `!=`, `<>`, `>`, `>=`, `<`, `<=`), `LIKE`, `IS NULL` and `IS NOT NULL`; `AND` and `OR` predicates (with standard SQL precedence: AND is evaluated before OR); GROUP BY, ORDER BY and LIMIT (maximum 500 returned rows). DISTINCT aggregate expressions are not supported. INNER JOIN and LEFT JOIN can combine the selected dataset with one other dataset in the same organization, using qualified column references; joined intermediate results are capped at 100,000 rows. Writes, multi-statement SQL and unsupported clauses are rejected. The current synchronous source limit is 256 KiB. SQL execution is audited without storing query text or cell values.

Example:
```sql
SELECT region, SUM(revenue) AS total_revenue
FROM data
WHERE status = 'Delivered'
GROUP BY region
ORDER BY total_revenue DESC
LIMIT 20;
```

## Python Lab
Python Lab loads the selected CSV through the authenticated download endpoint and executes the user's code in a browser Web Worker using Pyodide with pandas and NumPy. The code itself is not sent to the API and cannot access the page DOM through the worker. The first run downloads the Pyodide runtime and packages from its CDN and therefore needs internet access. Execution is stopped after 60 seconds. This is a client-side convenience runtime, not a server-hosted secure multi-tenant Python sandbox; users should not run untrusted notebooks or treat it as an isolated environment for secrets.

The starter notebook reads `data.csv`:
```python
import pandas as pd
import numpy as np

df = pd.read_csv("data.csv")
print(df.head())
print(df.describe(include="all"))
```

## Transformations and data quality
OWNER, LEADER and ANALYST can create a new immutable version using whitespace trimming, duplicate removal, missing-value fill strategies, empty-row removal, header normalization and explicit numeric-column conversion. The original source upload is Owner-only. Prior versions remain in history. Numeric conversion rejects columns containing non-numeric values instead of silently coercing them. Quality checks, anomaly scans, version comparison and CSV report export remain available in Data Workspace.

## BI Studio and insights
BI Studio currently builds a grouped bar-chart preview from the visible, server-paginated 50-row page. Users can select a category, numeric measure and text filter, export the chart data, and save named dashboard configurations to the organization's D1 store. Dashboards are scoped to the selected dataset; the Owner can delete any saved dashboard and its creator can delete their own. Automated data notes summarize visible-page missing cells, numeric ranges/averages and common categorical values. These are deterministic calculations, not an external generative-AI service, and they are not whole-dataset claims. Full-dataset chart aggregation, advanced visual types and AI-provider integration remain future work.

## Operational limits
- Current synchronous CSV processing and SQL query execution are limited to 256 KiB.
- SQL results are capped at 500 rows.
- Python runs locally in the browser and needs a network connection for the initial Pyodide download.
- BI charts and notes are based on the currently visible page.
- Live production validation still requires authenticated end-to-end tests, cross-tenant access tests, large-file/load testing, and confirmation that the deployed Cloudflare D1/KV/Queue bindings and migrations match the intended environment.
