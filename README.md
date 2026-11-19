# NEXUS ANALYTICS — Enterprise Analytics Hub

A multi-tenant analytics and team collaboration platform. The repository includes identity, organization access, team management, projects and task-tracking foundations with a responsive web application.

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
- `docs/ARCHITECTURE.md`: architecture and roadmap
- `docs/API-TESTING.md`: local API smoke-test sequence
- `docs/DEPLOYMENT.md`: production hosting and environment guide

## Local setup

### 1. Database
Create a MySQL 8 database and run `database/schema.sql`. The fresh-install schema includes identity, access requests, projects, tasks, datasets and reports. For an existing database, apply the scripts in `database/migrations/` in numeric order; migration scripts use `IF NOT EXISTS` for their tables.

### 2. API
Copy `apps/api/.env.example` to `apps/api/.env`, configure local database credentials and a random session secret of at least 32 characters. Configure SMTP credentials for production email verification and password recovery; development mode returns one-time links in the UI when SMTP is not configured.

From `apps/api`:
```bash
npm install
npm run dev
```
The API listens on port 4000 by default. Check `http://localhost:4000/health`. Set `DATA_STORAGE_DIR` to a private, persistent disk path for CSV uploads; never place it inside the public web root. The default local path is `apps/api/storage/datasets` when starting from `apps/api`.

### Database migrations
For an existing database, apply migrations in numeric order from `database/migrations/`. Migrations 001–006 add organization access requests, projects/tasks, dataset metadata, Power BI report links, notifications and email/password tokens; migration 007 adds immutable dataset version history.

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


## Team and invitation flow
- Open `/workspace/team` after signing in.
- Create an organization; its creator becomes OWNER.
- OWNER/ADMIN users can generate 7-day invitation links for MANAGER, ANALYST, VIEWER or ADMIN roles.
- Pending users can submit an organization-specific access request; OWNER/ADMIN/MANAGER users can view the queue, and OWNER/ADMIN users can approve or reject requests.
- OWNER/ADMIN/MANAGER users can view the organization member directory.
- Invitees can accept with an existing account or create an account from the invite link.
- Invite links are one-time tokens; only a matching invited email can accept with an existing account.
- When SMTP is configured, invitations are emailed automatically; without SMTP, the API returns a one-time URL for private manual delivery. Never expose invitation tokens in logs.

## Frontend routes
- `/`: sign in and open registration
- `/workspace`: authenticated profile and organization overview
- `/workspace/team`: organization creation, invitations, member directory, member role changes, suspension and access approval queue
- `/workspace/access`: browse organizations and request membership
- `/workspace/projects`: create projects, add tasks and update task status
- `/workspace/data`: upload CSV files, inspect metadata, preview 10 rows, run column profiles, upload new versions, compare schema/row counts and restore prior versions as a new version
- `/workspace/audit`: review organization audit activity (OWNER/ADMIN)
- `/workspace/reports`: manage the organization's Power BI report-link catalog
- `/workspace/notifications`: review and mark in-app notifications
- `/verify-email?token=...`: verify an email address
- `/forgot-password` and `/reset-password?token=...`: recover and reset account passwords
- `/accept-invite?token=...`: accept an invitation or create an invited account


For production, set `COOKIE_SECURE=true`, use HTTPS, and configure `APP_ORIGIN` and `INVITE_BASE_URL` to the deployed frontend. Prefer frontend and API custom subdomains under the same site (for example, `app.example.com` and `api.example.com`) so secure session cookies work reliably. If using separate cross-site hosting domains, assess browser third-party-cookie restrictions before choosing `COOKIE_SAME_SITE=none`; that setting also requires secure cookies.

## Notifications
In-app notifications are generated for access requests and decisions, invitation activity, task assignments and newly registered reports. The inbox is user-scoped and supports read/unread state. SMTP is used for email verification, password recovery and invitation delivery when configured.

## Data storage note
CSV uploads are stored outside the public web directory. The default local disk adapter is suitable for development only; configure a persistent private volume or replace the storage adapter with managed object storage before production. Dataset preview currently exposes only the first 10 rows. Dataset version history is recorded for each source upload. Re-uploads create immutable snapshots; the workspace can compare row counts and column names between versions and restore an older snapshot as a new version. Python cleaning jobs, row-level data diffs, retention controls and managed object storage remain future data-engineering work.

## Important production checklist
This is a development foundation, not production-certified software. Before public deployment, complete mature CSRF protection, MFA, automated invitation email delivery, tenant-isolation tests, security review, backups, monitoring and managed secret storage. Configure strict CORS and secure cookies for the deployed domains. Never commit real credentials or customer data.

## Roadmap
1. Identity, organizations, access requests and approvals — foundation implemented
2. Team directory and invitation flow — initial UI/API implemented
3. Projects and task tracking — initial UI/API implemented
4. Organization audit activity — initial read-only console/API implemented
5. CSV data catalog, column profiling, immutable version history, schema/row-count comparison and restore-as-new-version — implemented foundation
6. Power BI report-link catalog — initial registry implemented
7. In-app notifications and account recovery — initial implementation
8. Authorized data connectors and ingestion
9. Add row-level diffs, snapshot retention policies and managed object storage
10. Governed SQL/Python analyst workspace and cleaning pipeline
11. Power BI secure embedding and dashboard integration
12. MFA, alerts, backups and security hardening
