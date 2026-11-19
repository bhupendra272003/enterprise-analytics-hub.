# Cloudflare API Worker

This Worker is the first D1-backed API migration slice. It currently implements the authentication contract consumed by the existing web client:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /health`

## Bindings and configuration

The Worker expects:
- `DB`: D1 database binding.
- `DATASETS`: private R2 bucket binding.
- `DATASET_JOBS`: Cloudflare Queue producer binding for durable dataset jobs.
- `APP_ORIGIN`: exact HTTPS origin of the deployed frontend, with no trailing slash.
- `SESSION_TTL_SECONDS`: session lifetime; capped at 8 hours.
- `MAIL_API_KEY`: secret for the Resend email API.
- `MAIL_FROM`: verified sender identity configured with the email provider.

The checked-in `wrangler.jsonc` intentionally contains placeholders for the D1 database ID and frontend origin. Replace them only after creating the Cloudflare resources and choosing the final frontend hostname. Store `MAIL_API_KEY` as a Worker secret; never commit it.

## Authentication security

- Passwords are hashed with Web Crypto PBKDF2-HMAC-SHA-256 (310,000 iterations, random 128-bit salt, 256-bit derived key). Verification uses a constant-time byte comparison; this avoids shipping a JavaScript bcrypt implementation into the Workers runtime.
- Verification and reset tokens are random, stored only as SHA-256 hashes, and expire.
- Session identifiers are random, stored server-side in D1, and delivered as Secure, HttpOnly cookies.
- Login rotates the session; password reset revokes all sessions for the account.
- Mutating requests require the exact configured Origin and `X-Hub-Request: 1`.
- Auth endpoints apply a D1-backed rolling 15-minute attempt limit.
- Responses are marked `no-store`; CORS allows only the configured frontend origin.

## Migration boundary

The Worker now contains D1-backed route migrations for authentication, organizations/team, invitations, projects/tasks, datasets, cleaning, validation/anomaly scans, reports and notifications. The existing MySQL Express API remains the local/legacy implementation until feature parity and integration tests are verified.

### Dataset background jobs

- D1 migration `0004_dataset_jobs.sql` stores job state, progress, attempts, results and errors. Queue messages contain only a job ID; CSV contents remain in private R2.
- `POST /api/datasets/:datasetId/jobs` currently accepts `{ "type": "PROFILE" }`. `GET /api/datasets/:datasetId/jobs` lists recent jobs; `GET /api/dataset-jobs/:jobId` returns status/result; `POST /api/dataset-jobs/:jobId/cancel` requests cancellation. Routes enforce active organization membership.
- PROFILE is the only enabled queue processor in this first slice. Cleaning, validation, anomaly detection and row comparison are not queue jobs yet.
- Queue delivery retries are tracked; exhausted retries transition the D1 job to FAILED. This protects against jobs remaining indefinitely in RETRYING.
- The 256 KB CSV safety limit remains in place. PROFILE currently reads the bounded CSV into memory; it is not yet a large-file streaming/chunk processor. Do not raise the limit until streaming checkpoints, idempotency and retry recovery are implemented and tested.

### Cloudflare resource provisioning

The manual GitHub Actions workflow `.github/workflows/cloudflare-provision.yml` creates or reuses the D1 database, private R2 bucket and Queue, applies D1 migrations, and saves the D1 identifier as the repository variable `CLOUDFLARE_D1_DATABASE_ID`. It requires the existing repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Run it from **GitHub → Actions → Provision Cloudflare Free Resources → Run workflow**. It does not deploy the Worker or configure email.

Do not switch production traffic to this Worker yet. Before activation:
1. Run the resource provisioning workflow and confirm all remote D1 migrations are applied.
2. Set the actual frontend origin and API proxy target.
3. Configure and verify the email sender and `MAIL_API_KEY` secret.
4. Add integration tests for auth, session cookies, expiry, token reuse, password reset, CORS and dataset job lifecycle.
5. Migrate the remaining route groups and test tenant isolation before cutover.
