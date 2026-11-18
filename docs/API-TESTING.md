# NEXUS API smoke tests

Set:
- \`API=http://localhost:4000\`
- \`ORIGIN=http://localhost:3000\`
- Use a cookie jar (\`-c cookies.txt -b cookies.txt\`) for authenticated requests.
- Include \`Origin: $ORIGIN\` and \`X-Hub-Request: 1\` on every POST/PATCH request.

## Identity
1. Register a user with a password of at least 12 characters: \`POST /api/auth/register\`.
2. Sign in: \`POST /api/auth/login\`.
3. Verify profile: \`GET /api/auth/me\`.

## Organizations and access approvals
1. Create an organization: \`POST /api/organizations\` with \`{"name":"Northstar Analytics","slug":"northstar-analytics"}\`.
2. Read the public directory: \`GET /api/organizations/directory\`.
3. Create a second pending user, sign in as that user and submit \`POST /api/organizations/:orgId/request-access\`.
4. Sign in as the organization owner and inspect \`GET /api/organizations/:orgId/requests\`.
5. Approve using \`PATCH /api/organizations/:orgId/requests/:requestId\` with \`{"decision":"APPROVE","role":"ANALYST"}\`; also test REJECT.
6. Verify \`GET /api/organizations/:orgId/members\` contains only that organization's members.

## Invitations
1. As OWNER/ADMIN, create \`POST /api/invitations/organizations/:orgId/invitations\`.
2. Accept with an existing account using \`POST /api/invitations/accept\`, or create the invited account using \`POST /api/invitations/accept-signup\`.
3. Verify the invitation cannot be accepted twice, by a different email, or after expiry.

## Projects and tasks
1. As OWNER/ADMIN/MANAGER, create \`POST /api/organizations/:orgId/projects\`.
2. List projects: \`GET /api/organizations/:orgId/projects\`.
3. Add a task: \`POST /api/projects/:projectId/tasks\`.
4. List tasks: \`GET /api/projects/:projectId/tasks\`.
5. Update task status: \`PATCH /api/tasks/:taskId\` with \`{"status":"IN_PROGRESS"}\`.
6. Verify users outside the organization cannot list or modify the project/task. Verify only managers can change task priority or assignment.

## Health and database
- \`GET /health\` should return \`{"status":"ok","service":"nexus-analytics-api"}\`.
- Apply \`database/schema.sql\` to a fresh database.
- For an existing database, apply migrations in numeric order under \`database/migrations/\`.
- Use two different organizations during tenant-isolation checks. Confirm one organization's members, projects and tasks are never returned to another organization's user.

## Not yet production-certified
These smoke tests are manual. Add automated integration tests before public launch. Also complete CSRF tokens, email verification, password recovery, MFA, secure email delivery, rate limits for invitation/access endpoints, security review, backups and monitoring.
