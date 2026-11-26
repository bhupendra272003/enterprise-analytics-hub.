# Bhupendra's Vyron — Multi-Industry Analytics & Collaboration Platform

Vyron is a governed, multi-industry analytics workspace designed to connect data preparation, analysis, dashboarding, review and delivery. The project is approval-gated: participant onboarding, teams, role assignments and scheduled data generation are not activated until the trainer/institution approves the scope.

## Stack
- Web: Next.js 15, React 19, TypeScript
- API: Node.js 20+, Express, MySQL 8+
- Authentication: server-side sessions, bcrypt password hashing, email verification and password recovery
- Email: configurable SMTP via Nodemailer
- Validation: Zod
- Security baseline: Helmet, CORS allow-list, rate limiting and origin/request-header checks

## Repository layout
- `apps/web`: Next.js web application (sign-in, registration and authenticated workspace)
- `apps/api`: Express API
- `database/schema.sql`: MySQL schema
- `docs/ARCHITECTURE.md`: current architecture, security boundaries and roadmap
- `docs/PLATFORM_BLUEPRINT.md`: end-to-end platform design and delivery phases
- `docs/TRAINER_PROPOSAL.md`: trainer-ready project explanation and approval questions
- `docs/ROLE_GOVERNANCE.md`: organization roles, trainer access options and approval gates
- `docs/INDUSTRY_DATA_CATALOG.md`: proposed industry datasets and business questions
- `docs/DATA_GENERATION_SPEC.md`: Owner-controlled synthetic-data generation specification
- `docs/WORK_PERFORMANCE_SPEC.md`: contribution metrics, fairness and performance visibility
- `docs/API-TESTING.md`: local API smoke-test sequence
- `docs/DEPLOYMENT.md`: production hosting and environment guide

## Local setup

### 1. Database
Create a MySQL 8 database and run `database/schema.sql`. The fresh-install schema includes identity, access requests, projects, tasks, datasets, immutable dataset versions, validation history and reports. For an existing database, apply the scripts in `database/migrations/` in numeric order; migration scripts use `IF NOT EXISTS` for their tables. Migration 008 adds persisted dataset validation run history.

### 2. API
Copy `apps/api/.env.example` to `apps/api/.env`, configure local database credentials and a random session secret of at least 32 characters. Configure SMTP credentials for production email verification and password recovery; development mode returns one-time links in the UI when SMTP is not configured.

From `apps/api`:
```bash
npm install
npm run dev
```
The API listens on port 4000 by default. Check `http://localhost:4000/health`. Set `DATA_STORAGE_DIR` to a private, persistent disk path for CSV uploads; never place it inside the public web root. The default local path is `apps/api/storage/datasets` when starting from `apps/api`. Install Python 3 for the CSV cleaning engine; set `PYTHON_EXECUTABLE` if the executable is not available as `python` (Windows) or `python3` (Linux/macOS). The cleaning engine uses only Python's standard library.

### Database migrations
For an existing database, apply migrations in numeric order from `database/migrations/`. Migrations 001–009 add the existing identity, dataset, validation and anomaly foundations. Migration 010 proposes the four-role model, teams, performance events and Owner generator settings/jobs. Migration 011 adds auditable task assignment history and performance correction requests. Back up the database and review legacy role mapping before applying either migration.

### 3. Web app
Copy `apps/web/.env.example` to `apps/web/.env.local`. Set `NEXT_PUBLIC_API_URL=http://localhost:4000`.

From `apps/web`:
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

For local development, configure the API `APP_ORIGIN=http://localhost:3000` and `COOKIE_SECURE=false`. Use HTTPS and secure cookies in production.

## Current identity flow
- Registration creates a PENDING account and requires email verification before sign-in.
- Verified pending users can sign in to submit an organization-specific access request; suspended accounts are blocked.
- Organization administrators review requests before membership is activated.
- The authenticated workspace reads the signed-in profile and organization memberships.
- Organization-specific access is enforced by the API, not by hiding frontend links.
- The Cloudflare D1/Worker runtime now enforces exactly OWNER, MANAGER, LEADER and ANALYST organization roles; legacy ADMIN/VIEWER memberships are mapped to read-only MANAGER during D1 migration.


## Team and invitation flow
- Open `/workspace/team` after signing in.
- Create an organization; its creator becomes OWNER.
- The enforced Cloudflare organization roles are OWNER, MANAGER, LEADER and ANALYST only. OWNER manages invitations and role changes; MANAGER has read-only organization reporting; LEADER owns one team; ANALYST works on assigned tasks.
- Pending users can submit an organization-specific access request; OWNER and MANAGER can view the queue, and only OWNER can approve or reject requests.
- OWNER and MANAGER can view the organization member directory; only OWNER can change roles or membership status.
- Invitees can accept with an existing account or create an account from the invite link.
- Invite links are one-time tokens; only a matching invited email can accept with an existing account.
- When SMTP is configured, invitations are emailed automatically; without SMTP, the API returns a one-time URL for private manual delivery. Never expose invitation tokens in logs.

## Frontend routes
- `/`: sign in and open registration
- `/workspace`: authenticated profile and organization overview
- `/workspace/blueprint`: project briefing, industry templates, analytics lifecycle and governance overview
- `/workspace/team`: organization creation, Owner-managed invitations, member directory, four-role changes, suspension and access approval queue\n- `/workspace/teams`: Owner-managed team creation, one designated Leader per team and Analyst assignment\n- `/workspace/performance`: Owner/Manager organization-wide team, member, allocation, task-level evidence and Leader contribution reporting
- `/workspace/generator`: Owner-controlled synthetic data limits, preview, manual generation and job history; Manager can view job status
- `/workspace/access`: browse organizations and request membership
- `/workspace/projects`: create projects, add tasks and update task status
- `/workspace/data`: upload CSV files, inspect metadata, preview 10 rows, run column profiles, clean CSV data with Python, inspect before/after quality scores, define required/type/allowed-value/range/unique rules, validate immutable versions, review issue samples, quality trends, validation pass rates, recurring issue patterns, internally saved validation reports, version-to-version anomaly detection for numeric outliers, missingness spikes, category shifts, row-count changes and duplicate increases, with saved scan history and report replay, upload new versions, compare schema and row-level changes, and restore prior versions as a new version
- `/workspace/audit`: review organization audit activity (legacy API currently OWNER/ADMIN; target access policy must be updated)
- `/workspace/reports`: manage the organization's Power BI report-link catalog
- `/workspace/notifications`: review and mark in-app notifications
- `/verify-email?token=...`: verify an email address
- `/forgot-password` and `/reset-password?token=...`: recover and reset account passwords
- `/accept-invite?token=...`: accept an invitation or create an invited account


For production, set `COOKIE_SECURE=true`, use HTTPS, and configure `APP_ORIGIN` and `INVITE_BASE_URL` to the deployed frontend. Prefer frontend and API custom subdomains under the same site (for example, `app.example.com` and `api.example.com`) so secure session cookies work reliably. If using separate cross-site hosting domains, assess browser third-party-cookie restrictions before choosing `COOKIE_SAME_SITE=none`; that setting also requires secure cookies.

## Notifications
In-app notifications are generated for access requests and decisions, invitation activity, task assignments and newly registered reports. The inbox is user-scoped and supports read/unread state. SMTP is used for email verification, password recovery and invitation delivery when configured.

## Data storage note
The deployed Cloudflare Worker stores dataset CSV bytes and virtual workspace file bytes in private KV namespaces and metadata in D1. KV is not a dedicated object-storage vault; private R2 storage, retention/lifecycle controls and larger-file streaming remain future work. Device-download endpoints are disabled for every organization role; report and analysis outputs are stored as internal datasets. Dataset preview currently exposes only the first 10 rows. Dataset version history is recorded for each source upload. Re-uploads create immutable snapshots; the workspace can compare row counts and column names between versions and restore an older snapshot as a new version. The Python cleaning engine trims whitespace, optionally removes duplicate rows, fills missing values using a selected strategy, reports potential IQR outliers without deleting them, and saves its result as a new immutable dataset version. Dataset validation rules cover required values, expected data types, allowed values, numeric ranges and unique columns. Validation is non-destructive, records the rule set and result against an immutable version, and stores up to 100 issue samples per run while keeping full issue counts. The quality dashboard summarizes the latest 30 runs, computes a normalized score from issues per checked cell, highlights recurring rule failures, and saves run history as a private internal dataset. Version comparison includes key-based row-level diffs. Automated anomaly detection compares two immutable snapshots and flags IQR-based numeric outliers, significant missingness increases, low-cardinality category distribution shifts, row-count changes of at least 20%, and duplicate-rate increases. Scan results are stored in an immutable audit history with version pair, severity counts, timestamp and executor; users can reopen recent reports. Scanning never modifies source CSV data, uses documented thresholds, and reports findings as review signals rather than confirmed errors. Retention controls and managed object storage remain future data-engineering work.

## Important production checklist
This is a development foundation, not production-certified software. Before public deployment, complete mature CSRF protection, MFA, automated invitation email delivery, tenant-isolation tests, security review, backups, monitoring and managed secret storage. Configure strict CORS and secure cookies for the deployed domains. Never commit real credentials or customer data.

## Roadmap
1. Identity, organizations, access requests and approvals — foundation implemented
2. Team directory and invitation flow — initial UI/API implemented
3. Projects and task tracking — initial UI/API implemented
4. Organization audit activity — initial read-only console/API implemented
5. CSV data catalog, column profiling, Python cleaning, quality scoring, immutable version history, schema and row-level comparison, restore-as-new-version, validation rules and run history — implemented foundation
6. Power BI report-link catalog — initial registry implemented
7. In-app notifications and account recovery — initial implementation
8. Authorized data connectors and ingestion
9. Add row-level diffs, snapshot retention policies and managed object storage
10. Governed SQL/Python analyst workspace and cleaning pipeline
11. Power BI secure embedding and dashboard integration
12. MFA, alerts, backups and security hardening


## Approval-first operating model
No participants, teams, trainer accounts or fixed role assignments are pre-created. The trainer/institution first approves the scope, industries, permitted tools, workload, data policy and participant count. Only then should the owner invite members and configure teams. See [Trainer Proposal](docs/TRAINER_PROPOSAL.md) and [Role Governance](docs/ROLE_GOVERNANCE.md).

## Industry and dataset plan
The proposed starter catalog covers Banking & Finance, Hospital & Healthcare, Logistics & Supply Chain, and Retail & E-commerce. These are templates only; actual pilot industries are subject to approval. Use synthetic or formally approved de-identified data only.

## Owner-controlled data generation
There is no scheduled or automatic generation. The Cloudflare Worker branch now provides Owner-only generator settings, per-dataset/per-job row caps, preview, a confirmation-gated Generate action, a dedicated queue worker, progress, retry and cancellation. It refuses to run unless the organization has an active project, active team and active Analyst for its selected industry. The first templates generate synthetic Banking transactions, E-commerce orders, Logistics shipments or Hotel bookings. Current hard limits are 100,000 rows and 10 MiB per dataset; files are stored in the Worker KV namespace and can be background-profiled up to 10 MiB. R2 storage, pause/resume, multi-table relational generation, validation-before-publish and load testing remain outstanding. No job is scheduled or started automatically. See [Data Generation Specification](docs/DATA_GENERATION_SPEC.md).

## Architecture note
The repository contains both an Express/MySQL application path and a Cloudflare Worker path using D1, KV and Queues. Verify the authoritative deployed routing and storage path before implementing large-scale generation, shared editing or production data connectors. Do not treat local-disk CSV storage or a Power BI link catalog as production object storage or secure embedded BI.


## Target governance and performance model
The required four roles are OWNER, MANAGER, LEADER and ANALYST. Owner controls sensitive permissions and data generation; Manager views reports and performance; Leader assigns tasks to Analysts in their team; Analyst completes assigned work. Contribution tracking must use transparent task, review and data-quality evidence—not login time or keystrokes. The Cloudflare D1/Worker path now enforces the four roles and exposes team, task assignment history and Owner/Manager performance reports. The MySQL/Express path remains a legacy/local path and must not be assumed to have identical behavior. See [Role Governance](docs/ROLE_GOVERNANCE.md) and [Work Performance Specification](docs/WORK_PERFORMANCE_SPEC.md).
