# NEXUS deployment guide

This repository is deployable, but it is not currently deployed. Use separate frontend and API services with a shared registrable domain so the browser treats their session cookies as same-site.

## Recommended topology

- Frontend: Vercel or another Next.js host at `https://app.example.com`
- API: Node.js 20 service at `https://api.example.com`
- Database: managed MySQL 8 with TLS and network allow-listing
- Dataset storage: private persistent disk or managed object storage (never a public web directory)
- Email: SMTP provider for verification, password recovery and invitation delivery

## Database

1. Create an empty MySQL 8 database and a least-privilege application user.
2. Apply `database/schema.sql` for a new installation.
3. For an existing installation, apply `database/migrations/001_organization_access_requests.sql` through `006_auth_tokens.sql` in numeric order.
4. Restrict database network access to the API service and keep automated backups enabled.

## API service

Set the working directory to `apps/api`, install dependencies with `npm install`, and use `npm start`.

Required environment variables:
- `NODE_ENV=production`
- `PORT` (provided by the hosting platform)
- `APP_ORIGIN=https://app.example.com`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=strict`
- `SESSION_SECRET` (random secret, at least 32 characters)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `INVITE_BASE_URL=https://app.example.com/accept-invite`
- `DATA_STORAGE_DIR=/var/data/nexus-datasets` (mount a private persistent disk at the parent path)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

Do not deploy production registration without a working SMTP configuration. The API returns a development verification/reset URL only outside production.

## Frontend

Set the working directory to `apps/web`, install dependencies with `npm install`, build with `npm run build`, and start with `npm start`.

Set `NEXT_PUBLIC_API_URL=https://api.example.com` at build time.

## Session and domain notes

The frontend and API use different subdomains but share `example.com`; they are same-site, while CORS still requires the exact frontend origin. Avoid unrelated hosting domains for the production frontend/API pair because browser third-party-cookie restrictions can prevent session cookies from working. If a different topology is unavoidable, test cookie behavior in every supported browser before launch; `SameSite=None` requires HTTPS and is not guaranteed to bypass third-party-cookie blocking.

## Pre-launch verification

- Run the GitHub Actions workflow and confirm both API syntax and Next.js build jobs pass.
- Apply migrations and test registration, email verification, login, organization approval, invitation acceptance, member suspension, project/task permissions, CSV upload/profile, report links, notifications and audit activity.
- Verify tenant isolation with at least two organizations and multiple roles.
- Confirm CSV uploads persist across API restarts and are not reachable as public static files.
- Complete CSRF review, MFA, rate-limit review, monitoring, backups/restore test, dependency audit and security review.
- Keep Power BI access controlled in Power BI itself. NEXUS currently stores secure report links; it does not mint Power BI embed tokens.
