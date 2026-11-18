# NEXUS ANALYTICS — Enterprise Analytics Hub

A multi-tenant analytics and team collaboration platform. The repository includes identity, organization access, team management, projects and task-tracking foundations with a responsive web application.

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
Create a MySQL 8 database and run `database/schema.sql`, then apply `database/migrations/002_projects_tasks.sql` to enable projects and tasks. Migration 001 is safe to apply if the access-request table is not present.

### 2. API
Copy `apps/api/.env.example` to `apps/api/.env`, configure local database credentials and a random session secret of at least 32 characters.

From `apps/api`:
```bash
npm install
npm run dev
```
The API listens on port 4000 by default. Check `http://localhost:4000/health`.

### Database migrations
For an existing database, apply migrations in numeric order from `database/migrations/`. The initial schema creates identity and access-request tables; later migrations add projects and tasks.

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
- Pending users can sign in to submit an organization-specific access request; suspended accounts are blocked.
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
- Keep invitation URLs private. The current API returns the URL for manual delivery; production must integrate a trusted email provider and must not expose tokens in logs.

## Frontend routes
- `/`: sign in and open registration
- `/workspace`: authenticated profile and organization overview
- `/workspace/team`: organization creation, invitations, member directory and access approval queue
- `/workspace/access`: browse organizations and request membership
- `/workspace/projects`: create projects, add tasks and update task status
- `/workspace/audit`: review organization audit activity (OWNER/ADMIN)
- `/accept-invite?token=...`: accept an invitation or create an invited account


For production, set `COOKIE_SECURE=true`, use HTTPS, and configure `APP_ORIGIN` and `INVITE_BASE_URL` to the deployed frontend. Prefer frontend and API custom subdomains under the same site (for example, `app.example.com` and `api.example.com`) so secure session cookies work reliably. If using separate cross-site hosting domains, assess browser third-party-cookie restrictions before choosing `COOKIE_SAME_SITE=none`; that setting also requires secure cookies.

## Important production checklist
This is a development foundation, not production-certified software. Before public deployment, complete mature CSRF protection, email verification, password recovery, MFA, invitation email delivery, tenant-isolation tests, security review, backups, monitoring and managed secret storage. Configure strict CORS and secure cookies for the deployed domains. Never commit real credentials or customer data.

## Roadmap
1. Identity, organizations, access requests and approvals — foundation implemented
2. Team directory and invitation flow — initial UI/API implemented
3. Projects and task tracking — initial UI/API implemented
4. Organization audit activity — initial read-only console/API implemented
5. Authorized data connectors and ingestion
6. Immutable raw snapshots and versioned working datasets
7. Governed SQL/Python analyst workspace
8. Power BI/report integration and dashboards
9. Alerts, backups and security hardening
