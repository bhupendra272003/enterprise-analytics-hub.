# Bhupendra's Vyron — Deployment & Production Readiness

## Active deployment path
The repository contains a Cloudflare deployment workflow for the Next.js web application and the Cloudflare Worker API. Verify the latest GitHub Actions deployment run before treating a commit as live. The Worker uses D1 and Queues; its checked-in configuration also defines the storage bindings. Confirm the actual bindings and resource state in Cloudflare before enabling uploads or generation at production scale.

## Legacy/local Express + MySQL path
The repository also retains an Express API and MySQL schema for local development and a possible separate hosting deployment. This is not the same runtime as the Cloudflare Worker. Do not apply MySQL migrations to D1 or assume route/role parity between the two.

### Local API
1. Create a MySQL 8 database and apply `database/schema.sql` for a fresh local install.
2. For an existing local database, review and apply the numbered MySQL migrations in order. Back up first.
3. Copy `apps/api/.env.example` to `apps/api/.env`; configure local DB credentials and a random session secret of at least 32 characters.
4. Configure SMTP only with provider credentials stored in environment variables.
5. From `apps/api`, run `npm install` and `npm run dev`; verify `http://localhost:4000/health`.
6. Set `DATA_STORAGE_DIR` to a private persistent path outside the public web root.

### Local web app
1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Set `NEXT_PUBLIC_API_URL=http://localhost:4000`.
3. From `apps/web`, run `npm install` and `npm run dev`; open `http://localhost:3000`.
4. Configure the API `APP_ORIGIN=http://localhost:3000` and `COOKIE_SECURE=false` for local development only.

## Production verification checklist
- Confirm the deployed web app and API point to the intended environment.
- Verify registration, email verification, login, logout, password reset and session expiry.
- Test organization creation, invitations, access approvals and each supported role using separate accounts.
- Test tenant isolation across at least two organizations.
- Upload a non-sensitive test CSV; verify private storage, preview, profiling, cleaning, validation and version history.
- Test queue retries, cancellation and failure recovery.
- Reconcile dashboard metrics against documented SQL queries and source extracts.
- Confirm report links are organization-scoped. Secure Power BI embedding and automated refresh are not implemented by the report-link catalog.
- Verify backups and perform a restore drill before storing real customer data.

## Launch safeguards and known gaps
This repository is a development foundation, not production-certified software. Complete independent CSRF/security review, MFA, tenant-isolation tests, dependency audit, backup/restore drills, monitoring and alerting before onboarding real customer data. Keep credentials in provider secret settings, never in GitHub files or browser code. Do not claim live MariaDB connectivity, Power BI refresh or secure embedding until each is implemented and tested end to end.
