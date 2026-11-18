# API smoke-test guide

Use Postman or Insomnia with cookie persistence enabled. For POST requests, send:
- Content-Type: application/json
- Origin: http://localhost:3000
- X-Hub-Request: 1

## Register
POST /api/auth/register
Request body:
{"fullName":"Workspace Founder","email":"founder@example.com","password":"ChangeThisPassword123!"}

Registration creates a PENDING account. For local-only first-run testing, activate the founder directly in MySQL:
UPDATE users SET account_status='ACTIVE' WHERE email='founder@example.com';

## Login
POST /api/auth/login
{"email":"founder@example.com","password":"ChangeThisPassword123!"}

## Create organization
POST /api/organizations
{"name":"Nexus Analytics","slug":"nexus-analytics"}

## Invite a teammate
POST /api/organizations/ORGANIZATION_ID/invitations
{"email":"analyst@example.com","role":"ANALYST"}

The current development API returns a one-time invitation URL for manual delivery. Production must send invitations through a trusted transactional email provider and must not expose invitation tokens in API responses.
