# Bhupendra's Vyron — Architecture & Delivery Boundaries

## Product intent
A multi-tenant, multi-industry analytics and collaboration workspace that takes work from requirements and raw data through cleaning, validation, analysis, dashboarding, QA and delivery. Participant count, team count and selected industries remain configurable after trainer/institution approval.

## Repository architecture observed
- Web: Next.js 15, React 19, TypeScript.
- Express API path: Node.js, Express and MySQL; includes account, organization, project, task, dataset, report, notification and audit routes.
- Cloudflare Worker path: TypeScript Worker with D1, KV and Queues; includes authentication and organization, project, dataset, report and background dataset-job handlers.
- Data: CSV upload and Python cleaning/profiling capabilities exist in the Express application. The Worker path includes queued dataset profiling jobs with a current small-file safety limit.
- BI: organization-scoped Power BI report-link catalog. Secure Power BI embedding is not implemented.
- Storage: the Express CSV adapter uses local disk. The Worker bindings shown in wrangler configuration include D1, KV and Queues; no R2 binding is currently declared in that configuration.

**Deployment caution:** both application paths are present. Confirm which API path is actually routed in production before changing schema, storage, job scheduling or data generation. Do not assume the Express/MySQL and Worker/D1 schemas are interchangeable.

## Existing implementation foundation
- Registration, email verification, login, session handling and password recovery.
- Organizations, membership roles, access requests, invitations and membership management.
- Projects, tasks, statuses, priorities, assignees and due dates.
- CSV dataset catalog, preview, Python cleaning, profiling and validation.
- Immutable dataset versions, version comparison and restore-as-new-version.
- Quality/anomaly history and organization audit events.
- In-app notifications and Power BI report-link catalog.
- Worker background profiling job queue.

These are initial product capabilities and require testing/hardening; this is not a production-certification claim.

## Target product modules
1. Overview and project health.
2. Industry and dataset catalog with data dictionary, lineage and sensitivity.
3. Governed ingestion, cleaning, validation and immutable versioning.
4. SQL/Python analyst workspace and documented business questions.
5. Project delivery: milestones, dependencies, assignments, handoffs and review.
6. BI and reporting: KPI definitions, Power BI integration and approved exports.
7. People and governance: organization roles plus project-scoped responsibilities and dataset permissions.
8. Synthetic data engine: scheduled, idempotent, chunked background jobs and run history.
9. Trainer/reviewer view with explicitly granted, limited access.

## Role model
### Organization roles currently present
- OWNER: accountable organization owner.
- ADMIN: organization member/settings administration subject to server-side rules.
- MANAGER: project coordination and task management.
- ANALYST: authorized analysis and assigned work.
- VIEWER: read-only access.

### Project responsibilities proposed
Project Lead, Data Engineer/Data Steward, Data Cleaner, Analyst, BI Developer, QA/Reviewer and Trainer/Mentor. These are responsibilities, not necessarily new organization roles. A person may hold multiple responsibilities in a small cohort and roles may rotate.

### Trainer access recommendation
Start with limited Reviewer/Mentor access to approved project information. Consider Manager only if the trainer agrees to coordinate daily delivery. Grant Admin only with explicit consent and a defined administrative responsibility. Do not grant platform-wide administrator rights by default. Project-scoped reviewer permissions still need implementation before being promised as a live feature.

## Approval gates
1. Proposal and scope prepared.
2. Trainer/institution approves objectives, industries, data rules, workload and tools.
3. Participant count and consent confirmed.
4. Invitations and memberships activated.
5. Teams, leads, tasks and project permissions configured.
6. Operational launch after storage, security and performance checks.

No team, participant or recurring generation schedule is created by the blueprint itself.

## Data lifecycle
Requirements → Discovery → Ingestion → Profiling → Cleaning → Validation → SQL/Python → Dashboarding → QA/Reconciliation → Insights → Review → Delivery → Monitoring.

Raw files remain immutable. Cleaning and validation create versioned outputs. Every handoff should record dataset version, owner, status, checks performed and approval. Use synthetic or formally approved de-identified data; do not introduce real patient, bank-customer or payment-card data without authorization and safeguards.

## Synthetic data generation
The discussed planning volumes are 50,000+ initial rows and 10,000+ daily additions. Whether those are per industry or aggregate is not yet confirmed. Keep volume configurable and generation disabled until confirmation, trainer approval, storage selection and load testing. Use queue-based chunk processing, idempotency keys, bounded concurrency, retries, run logs and safe failure recovery. Never generate a large batch synchronously in a web request.

## Security and production gaps
- Project-scoped roles and dataset/column-level access controls.
- Durable private object storage and retention/lifecycle policy.
- Approved database/API connectors with least-privilege credentials.
- Safe concurrent editing, conflict handling and lineage.
- Secure Power BI embedding and token lifecycle.
- CSRF review, MFA, tenant-isolation tests and independent security review.
- Backups, restore drills, monitoring, alerting and secret management.
- Load tests for large datasets and dashboard responsiveness.

Do not claim these gaps are already implemented.

## Trainer presentation
See [Trainer Proposal](TRAINER_PROPOSAL.md), [Platform Blueprint](PLATFORM_BLUEPRINT.md), [Role Governance](ROLE_GOVERNANCE.md), [Industry Data Catalog](INDUSTRY_DATA_CATALOG.md) and [Data Generation Specification](DATA_GENERATION_SPEC.md).
