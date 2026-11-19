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
- `DATASETS`: private R2 bucket binding (reserved for the dataset route migration).
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

This Worker currently handles authentication only. Organization/team, invitations, projects/tasks, datasets, cleaning, validation/anomaly scans, reports, notifications and audit browsing still need route-by-route D1 implementations. The existing MySQL Express API remains the local/legacy implementation until the new Worker reaches feature parity and integration tests pass.

Do not switch production traffic to this Worker yet. Before activation:
1. Create the D1 database and apply all migrations in `database/d1`.
2. Create the private R2 bucket.
3. Set the actual frontend origin and API proxy target.
4. Configure and verify the email sender and `MAIL_API_KEY` secret.
5. Add integration tests for auth, session cookies, expiry, token reuse, password reset, and CORS.
6. Migrate the remaining route groups and test tenant isolation before cutover.
