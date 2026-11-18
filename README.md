# NEXUS ANALYTICS — Enterprise Analytics Hub

A multi-tenant analytics and team collaboration platform. The repository currently contains the identity foundation and the first responsive web application.

## Stack
- Web: Next.js 15, React 19, TypeScript
- API: Node.js 20+, Express, MySQL 8+
- Authentication: server-side sessions and bcrypt password hashing
- Validation: Zod
- Security baseline: Helmet, CORS allow-list, rate limiting and origin/request-header checks

## Repository layout
- `apps/web`: Next.js web application (sign-in, registration and authenticated workspace)
- `apps/api`: Express API
- `database/schema.sql`: MySQL schema
- `docs/ARCHITECTURE.md`: architecture and roadmap
- `docs/API-TESTING.md`: local API smoke-test sequence

## Local setup

### 1. Database
Create a MySQL 8 database and run `database/schema.sql`.

### 2. API
Copy `apps/api/.env.example` to `apps/api/.env`, configure local database credentials and a random session secret of at least 32 characters.

From `apps/api`:
```bash
npm install
npm run dev
```
The API listens on port 4000 by default. Check `http://localhost:4000/health`.

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
- Registration creates a PENDING account.
- Login is allowed only for ACTIVE accounts.
- The authenticated workspace reads the signed-in profile and organization memberships.
- Organization-specific access is enforced by the API, not by hiding frontend links.


## Team and invitation flow
- Open `/workspace/team` after signing in.
- Create an organization; its creator becomes OWNER.
- OWNER/ADMIN users can generate 7-day invitation links for MANAGER, ANALYST, VIEWER or ADMIN roles.
- Invitees can accept with an existing account or create an account from the invite link.
- Invite links are one-time tokens; only a matching invited email can accept with an existing account.
- Keep invitation URLs private. The current API returns the URL for manual delivery; production must integrate a trusted email provider and must not expose tokens in logs.

## Frontend routes
- `/`: sign in and open registration
- `/workspace`: authenticated profile and organization overview
- `/workspace/team`: organization creation and invitations
- `/accept-invite?token=...`: accept an invitation or create an invited account


For production, set `COOKIE_SECURE=true`, use HTTPS, and configure `APP_ORIGIN` and `INVITE_BASE_URL` to the deployed frontend. Prefer frontend and API custom subdomains under the same site (for example, `app.example.com` and `api.example.com`) so secure session cookies work reliably. If using separate cross-site hosting domains, assess browser third-party-cookie restrictions before choosing `COOKIE_SAME_SITE=none`; that setting also requires secure cookies.

## Important production checklist
This is a development foundation, not production-certified software. Before public deployment, complete mature CSRF protection, email verification, password recovery, MFA, invitation email delivery, tenant-isolation tests, security review, backups, monitoring and managed secret storage. Configure strict CORS and secure cookies for the deployed domains. Never commit real credentials or customer data.

## Roadmap
1. Identity, organizations and access approvals
2. Team directory and invitation UI
3. Projects, tasks, assignments and reviews
4. Authorized data connectors and ingestion
5. Immutable raw snapshots and versioned working datasets
6. Governed SQL/Python analyst workspace
7. Power BI/report integration and dashboards
8. Audit console, alerts, backups and security hardening
