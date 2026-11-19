# NEXUS ANALYTICS — Production deployment

This guide uses Vercel for the Next.js frontend and Render for the Express API. The browser calls the API through a same-origin Vercel rewrite so the session cookie remains first-party even when the API runs on Render.

## 1. Database (managed MySQL 8)

1. Create a managed MySQL 8 instance (Aiven MySQL or an equivalent provider).
2. Create a dedicated least-privilege application user and database.
3. Enable TLS, restrict inbound access to the API service where the provider supports it, and enable automated backups.
4. For a new database, apply `database/schema.sql`.
5. For an existing database, apply every migration in `database/migrations/` in numeric order (001 through 009). Do not skip 007, 008 or 009: they create dataset version, validation-run and anomaly-run history.
6. Keep the database hostname, port, database name, username and password ready for the Render environment. Never commit credentials.

## 2. Deploy the API on Render

1. Connect this GitHub repository to Render and create a Web Service from the root `render.yaml` Blueprint.
2. Confirm the service uses the Dockerfile at `apps/api/Dockerfile`, health check path `/health`, and a private persistent disk mounted at `/var/data`.
3. Set the required secrets in Render:
   - `SESSION_SECRET`: random value of at least 32 characters
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `DB_SSL_CA`: the managed MySQL provider's CA certificate (PEM text); required when the provider enforces TLS
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
4. Set `APP_ORIGIN` to the final Vercel frontend URL (for example `https://your-app.vercel.app`) and `INVITE_BASE_URL` to that URL plus `/accept-invite`.
5. Set `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=strict`.
6. Deploy and verify `https://YOUR-API.onrender.com/health` returns JSON with status `ok`.

Do not enable production registration until SMTP verification and password-recovery emails have been tested.

## 3. Deploy the frontend on Vercel

1. Import the same GitHub repository into Vercel.
2. Set the Root Directory to `apps/web`.
3. Add these environment variables for Production:
   - `NEXT_PUBLIC_API_URL`: the exact public Vercel frontend origin, e.g. `https://your-app.vercel.app` (no trailing slash)
   - `API_PROXY_TARGET`: the Render API origin, e.g. `https://your-api.onrender.com` (no trailing slash)
4. Deploy. The Next.js rewrite proxies `/api/*` to Render while keeping browser requests and the session cookie on the Vercel origin.
5. Update Render `APP_ORIGIN` and `INVITE_BASE_URL` to the exact Vercel URL if Vercel assigned a different URL, then redeploy the API.

Do not set `NEXT_PUBLIC_API_URL` to the Render domain. It must be the frontend's own origin for first-party session cookies.

## 4. Production verification

- Register a new account and verify the email from the SMTP inbox.
- Sign in, create an organization, request/approve membership and accept an invitation.
- Test roles with separate accounts and at least two organizations to verify tenant isolation.
- Create projects/tasks and test permission boundaries.
- Upload a CSV, restart/redeploy the API, and verify the file still exists on the private persistent disk.
- Test cleaning, validation, version comparison/restore and saved anomaly history.
- Test password reset, session revocation, notifications, audit activity and Power BI report links.
- Confirm CSV files cannot be fetched from a public URL.
- Test a backup restore before real customer data is stored.

## Important limitations and launch safeguards

- NEXUS stores Power BI report links; it does not currently mint secure Power BI embed tokens.
- The API currently uses a private local-disk storage adapter; the Render persistent disk is required. Do not scale the API to multiple instances until storage is moved to shared object storage.
- Complete an independent CSRF/security review, dependency audit, tenant-isolation test and backup/restore drill before onboarding real customer data.
- Keep all credentials in provider secret settings, never in GitHub files or chat.
