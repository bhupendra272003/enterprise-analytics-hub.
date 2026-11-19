# NEXUS ANALYTICS — Architecture

## Current architecture

- Web application: Next.js 15, React 19 and TypeScript.
- API: Node.js 20 and Express.
- Identity: server-side MySQL sessions, bcrypt password hashing, email verification and password-reset tokens.
- Tenant model: organizations, memberships and role-based API authorization.
- Database: MySQL 8.
- Data ingestion: CSV upload with a private local-disk storage adapter, metadata catalog, 10-row preview and basic column profiling.
- Reporting: organization-scoped Power BI report-link catalog. Power BI itself remains responsible for report access.
- Notifications: user-scoped in-app inbox for access decisions, invitations, task assignments and report publication.
- Audit: organization-scoped activity feed for owners/admins.

## Multi-tenant security

Every organization-owned API operation checks the signed-in user's active membership in the requested organization. Never rely on frontend visibility for authorization. User-level notifications are filtered by the authenticated user. Dataset previews and files are accessible only after membership checks.

## Roles

- OWNER: full organization administration, member management and access decisions.
- ADMIN: manage organization members and settings; cannot grant administrator privileges or modify another admin.
- MANAGER: coordinate projects, assign tasks, review access requests and view the member directory.
- ANALYST: create tasks, work with authorized datasets and reports; can update only tasks assigned to them.
- VIEWER: read-only organization access.

## Data lifecycle

The current CSV adapter stores source files outside the public web directory and persists metadata plus a small preview in MySQL. Each initial upload is registered as immutable version 1 in `dataset_versions`, including its own storage path, row/column counts, schema and preview. The adapter remains development/local-disk; production requires a persistent private volume or managed object storage. Re-uploads create immutable snapshots. Members can compare row counts and column names between two versions; authorized analyst roles can restore an older snapshot by creating a new version rather than overwriting history. Row-level diffs, Python cleaning workers, quality rules, retention controls and managed object storage remain planned.

## Security controls currently present

- Password hashing with bcrypt.
- Email verification required before sign-in for open registration.
- One-time, expiring verification and password-reset tokens stored as SHA-256 hashes.
- Password reset revokes sessions stored in the MySQL session table.
- Session regeneration on login.
- Secure cookie settings configurable by environment.
- Helmet, exact-origin CORS, request-origin/header guard and authentication rate limiting.
- Tenant-scoped membership checks and audit events for key operations.

## Production gaps

Complete a dedicated CSRF review and token strategy, MFA, automated security/dependency scanning, tenant-isolation integration tests, object-storage adapter, monitoring/alerting, backup/restore drills, and independent security review. Power BI secure embedding and service-principal token handling are not implemented; current integration is a link catalog only.

## Roadmap

1. Complete identity and access management with MFA and security review.
2. Add persistent object storage, row-level dataset diffs, snapshot retention and lifecycle policies.
3. Add Python profiling/cleaning jobs and governed analyst workspace.
4. Add approved data connectors and scheduled ingestion.
5. Add secure Power BI embedding and dashboard integration.
6. Add operational alerts, monitoring and recovery automation.
