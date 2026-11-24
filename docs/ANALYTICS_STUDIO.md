# Analytics Studio — Execution and Governance

## Spreadsheet Lab

The current Spreadsheet Lab is a governed data inspector, not a complete Excel-compatible spreadsheet. It provides a server-paginated grid, search, sorting, CSV upload, column profiling, cleaning transformations, validation rules, immutable dataset versions, version comparison and record-level diffs. The current ingestion format is CSV (maximum 10 MiB). Synchronous analysis is limited to 256 KiB for operations that do not have a background job; background profiling supports the documented 10 MiB safety limit.

Not yet implemented: editable workbook cells, formula bar, Excel-compatible formula library, multiple sheets, workbook files, pivot tables, Power Query, conditional formatting parity, XLSX/XLS/JSON/TSV imports and external Get Data connectors.

## SQL Studio

SQL Studio runs against private, organization-scoped CSV datasets. It is not a MySQL server or a complete MySQL dialect. The Worker supports one read-only SELECT statement, projected columns and DISTINCT, COUNT/SUM/AVG/MIN/MAX, WHERE comparisons, LIKE, IS NULL/IS NOT NULL, AND/OR predicates, GROUP BY, ORDER BY and LIMIT (maximum 500 returned rows). INNER JOIN and LEFT JOIN can combine the selected dataset with one other dataset in the same organization; joined intermediate rows are capped at 100,000. Writes and multi-statement SQL are rejected.

Synchronous source processing is limited to 256 KiB. Background SQL jobs support datasets up to 10 MiB, but results still use the bounded query engine and result preview. Query outputs can be saved as new private Vyron datasets and shared through dataset handoffs. They are not downloaded to the device.

Not yet implemented: native MySQL connectivity, connection manager, schema browser, query plans, transactions, stored procedures, triggers, full dialect compatibility, larger durable result materialization and arbitrary multi-table joins.

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

Python Lab currently provides a code editor and starter template only. Execution is disabled. No source dataset is transferred to a browser/CDN Python runtime. A private isolated server-side runner must be provisioned before execution can be safely enabled. Required controls include tenant-scoped inputs, no public file URLs, no outbound network, ephemeral storage, CPU/memory/time/output limits, and results written back to Vyron's private storage.

## BI Studio

BI Studio calculates full-dataset summaries and grouped category totals for the selected internal dataset. For larger datasets it can queue a background analysis job. The current chart view is a grouped bar-chart preview with a category filter and a top-20 category limit. Users can save dashboard configurations, chart data and report JSON as internal Vyron datasets. A saved dashboard configuration is not a full Power BI report.

Not yet implemented: DAX, semantic models, relationships, measures/calculated columns, advanced visual library, drill-through, bookmarks, paginated reports, scheduled refresh, Power BI Desktop parity or licensed Power BI Service embedding.

## Private storage and sharing

Uploaded CSV files and generated result datasets are stored under private workspace storage and are accessed through organization membership and dataset permissions. SQL, BI and quality-report outputs can be saved as internal datasets and opened through Data Workspace or a handoff. Device-download endpoints are disabled for every role. Importing a source file still requires selecting and uploading it into Vyron.

The active Cloudflare Worker currently uses D1 for metadata and KV for private dataset bytes. KV is not a dedicated object-storage vault; migration to private R2/object storage, retention policies, larger-file streaming and storage lifecycle controls remain outstanding.

## Operational limits and security work

- CSV upload maximum: 10 MiB.
- Synchronous data processing: 256 KiB for routes without background processing.
- Background profile and SQL jobs: up to 10 MiB.
- SQL output: maximum 500 returned rows; JOIN intermediate rows: maximum 100,000.
- Python execution is disabled until a secure runner is deployed.
- No device downloads are permitted by the application download route.
- XLSX/XLS/JSON/TSV ingestion, Get Data connectors, spreadsheet formulas, full SQL compatibility and advanced BI remain future work.
- Production hardening still requires authenticated end-to-end tests, cross-tenant isolation tests, CSRF/MFA review, backups and restore drills, monitoring/alerting, secret management and load testing.
