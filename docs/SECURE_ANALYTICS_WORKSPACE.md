# Vyron secure analytics workspace

## Current deployment boundary

The production application is a Cloudflare Workers application. The API Worker uses Cloudflare D1 for metadata and Cloudflare KV for private dataset objects. It does not run a persistent MySQL server, a native VS Code desktop process, or a general-purpose Python process. A browser page cannot install desktop applications into a user's device or into a Cloudflare Worker.

## Implemented in-app workflow

- Dataset source upload and replacement remain Owner-only.
- Analysts and Team Leaders receive dataset access only when an Owner/Leader assigns a dataset handoff to them or to their team.
- Handoffs reference a stored dataset version; they do not attach a public URL or copy a file to a user's download folder.
- Stages: CLEANING, SQL_REVIEW, DASHBOARD and RECONCILIATION.
- Assigned analysts can start work and submit a saved version. SQL and reconciliation stages can submit a bounded JSON result (up to 50 columns, 100 rows and 50 KB).
- Owners and the assigned Team Leader can approve or return submissions. Approved SQL/QA results are visible to other analysts who have been assigned the same dataset.
- Assignment, submission, review and denied export attempts are written to the organization audit log.
- Full source CSV download is Owner-only. Analytics result exports, chart-data exports, BI report JSON and print/PDF controls are Owner-only in the UI.
- SQL Studio runs a restricted, read-only SELECT query engine against stored datasets and supports bounded filters, aggregates, grouping, ordering and tenant-scoped two-dataset joins. It is not a MySQL server or a complete MySQL dialect.
- BI Studio provides native in-app summaries and charting without sending the source file to Power BI Service.

## Remaining infrastructure integrations

### MySQL

For genuine MySQL compatibility, provision a separate analytics MySQL instance/schema and a dedicated read-only database principal. Do not reuse Vyron's operational D1/application credentials. The API should broker queries server-side, restrict each query to datasets granted to that user/team, enforce SELECT-only access, row/time limits and audit logging. Database credentials must be server secrets and never reach the browser. This repository does not currently have an analytics MySQL endpoint or its connection secrets.

### Python

The previous browser Pyodide/CDN execution path has been disabled. It fetched source data into the browser and depended on a third-party runtime download. The replacement must be a private, isolated Python execution service with no public file URLs, no outbound network, per-job CPU/memory/time/output limits, ephemeral storage, tenant-scoped inputs, and results written back to Vyron's private storage. Cloudflare Workers cannot safely spawn a local Python process. This service still needs to be provisioned and connected; until then Python code is retained in the editor but execution remains disabled.

### VS Code-like editor

A browser code editor (Monaco/CodeMirror style) can be embedded in the Analytics Studio, with file explorer, tabs, syntax highlighting and run/output panels. It is not the full desktop VS Code application. Execution must be delegated to the isolated Python/SQL services above.

### Power BI

Power BI Desktop cannot be installed inside the web application. Power BI Service reports can be embedded only with the appropriate Microsoft Entra application, embed-token backend, workspace/report permissions and licensing/capacity. Imported data is processed by Microsoft's service, so it does not meet a strict "data must stay inside Vyron" policy by default. Native BI Studio is the in-platform option for that policy.

## Rollout requirement

The D1 migration 0009_dataset_handoffs.sql is deployed by the Cloudflare deployment workflow. CI validates the migration and Worker types. The migration must be applied before the new handoff API is used. A successful CI run is not, by itself, proof that the production D1 migration and UI deployment have completed; check the Cloudflare deployment workflow and live workspace after deployment.
