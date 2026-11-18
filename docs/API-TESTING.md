# NEXUS API smoke tests

Set:
- `API=http://localhost:4000`
- `ORIGIN=http://localhost:3000`
- Use a cookie jar (`-c cookies.txt -b cookies.txt`) for authenticated requests.
- Include `Origin: $ORIGIN` and `X-Hub-Request: 1` on every POST/PATCH request.
- Apply `database/schema.sql` to a fresh MySQL 8 database, or apply migrations 001–006 in order to an existing installation.

## Identity and recovery
1. Register with a password of at least 12 characters: `POST /api/auth/register`.
2. In development without SMTP, open the returned `verificationUrl`; with SMTP, use the email link.
3. Verify email: `POST /api/auth/verify-email` with the token.
4. Sign in: `POST /api/auth/login`; unverified accounts must be rejected.
5. Verify profile: `GET /api/auth/me`.
6. Test resend verification: `POST /api/auth/resend-verification`.
7. Test password recovery: `POST /api/auth/forgot-password`, then `POST /api/auth/reset-password`; verify the reset token is one-time and previous sessions are revoked.

## Organizations and access approvals
1. Create an organization: `POST /api/organizations` with `{"name":"Northstar Analytics","slug":"northstar-analytics"}`.
2. Read the public directory: `GET /api/organizations/directory`.
3. Sign in as a verified pending user and submit `POST /api/organizations/:orgId/request-access`.
4. As OWNER/ADMIN, inspect `GET /api/organizations/:orgId/requests`.
5. Approve using `PATCH /api/organizations/:orgId/requests/:requestId` with `{"decision":"APPROVE","role":"ANALYST"}`; also test REJECT.
6. Verify `GET /api/organizations/:orgId/members` returns only that organization's members.
7. Test `PATCH /api/organizations/:orgId/members/:userId` for role changes and suspension; verify an ADMIN cannot grant ADMIN or change another ADMIN.

## Invitations
1. As OWNER/ADMIN, create `POST /api/invitations/organizations/:orgId/invitations`.
2. With SMTP, verify the invitation email arrives; without SMTP, use the returned development/manual URL.
3. Accept with an existing account using `POST /api/invitations/accept`, or create the invited account using `POST /api/invitations/accept-signup`.
4. Verify the invitation cannot be accepted twice, by a different email, or after expiry.

## Projects and tasks
1. As OWNER/ADMIN/MANAGER, create `POST /api/organizations/:orgId/projects`.
2. List projects: `GET /api/organizations/:orgId/projects`.
3. Add a task: `POST /api/projects/:projectId/tasks`; managers may assign an active member.
4. List tasks: `GET /api/projects/:projectId/tasks`.
5. Update task status: `PATCH /api/tasks/:taskId` with `{"status":"IN_PROGRESS"}`.
6. Verify only managers or the assigned member can update task status; only managers can change priority/assignment.

## Data, reports and notifications
1. Upload a CSV using multipart `POST /api/organizations/:orgId/datasets` with `name` and `file`.
2. Read `GET /api/organizations/:orgId/datasets`, `GET /api/datasets/:datasetId/preview` and `GET /api/datasets/:datasetId/profile`.
3. Register a Power BI link using `POST /api/organizations/:orgId/reports`; only approved Power BI HTTPS hostnames are accepted.
4. Read/mark notifications using `GET /api/notifications`, `PATCH /api/notifications/:notificationId/read` and `PATCH /api/notifications/read-all`.
5. Review audit events using `GET /api/organizations/:orgId/audit?limit=100`.

## Health and tenant isolation
- `GET /health` should return `{"status":"ok","service":"nexus-analytics-api"}`.
- Use at least two organizations and several roles. Confirm no member, task, dataset preview, report or audit data crosses tenant boundaries.
- Confirm uploaded CSV files are stored outside the public web root and persist across API restarts.
- These are manual smoke tests; automated integration and security tests are still required before production.
