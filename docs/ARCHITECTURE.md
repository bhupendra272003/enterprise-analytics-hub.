# NEXUS ANALYTICS — Architecture

## Principles
1. Multi-tenant: every organization-owned record is scoped to an organization.
2. Least privilege: enforce permissions in the API, not only in the UI.
3. Data integrity: raw ingested snapshots remain separate from analyst working copies.
4. Traceability: security-sensitive actions emit audit events.
5. Human approval: self-registration creates a pending account; organization access requires invitation or approval.
6. Separation of duties: owners, admins, managers, analysts and viewers have distinct permissions.

## Logical architecture
Browser (Next.js) -> HTTPS API (Node.js / Express) -> Auth/session -> RBAC + tenant scope -> MySQL.
Future services: queue, Python workers, object storage, approved API/database connectors, reporting layer and Power BI integration.

## Roles
- OWNER: full organization administration and security policy.
- ADMIN: manage members and organization settings, but not transfer ownership.
- MANAGER: manage projects and assignments within permitted scope.
- ANALYST: work on assigned projects and working datasets.
- VIEWER: read-only access to explicitly shared resources.

## Data governance
- Raw ingestion records are append-only at application level.
- Analysts work on derived datasets.
- Dataset versions are immutable; transformations create new versions.
- Retention/purge requires a separate owner-controlled, audited workflow.
- Audit events should be exported to tamper-resistant storage.
- A database or infrastructure superuser may still override application-level restrictions.

## Roadmap
02 Team directory and invitation UI
03 Projects, tasks, assignment, deadlines and reviews
04 Approved data-source registry and scheduled ingestion
05 Raw/working dataset versioning and Python cleaning jobs
06 Governed SQL workspace
07 Power BI/report integration and dashboards
08 Audit console, alerts, backups, MFA and security hardening
