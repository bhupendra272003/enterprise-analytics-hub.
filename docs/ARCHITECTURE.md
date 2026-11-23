# Bhupendra's Vyron — Architecture & Delivery Boundaries

## Product intent
A multi-tenant, multi-industry analytics and collaboration workspace that takes work from requirements and raw data through cleaning, validation, analysis, dashboarding, QA and delivery. Participant count, team count and selected industries remain configurable after trainer/institution approval.

## Repository architecture observed
- Web: Next.js 15, React 19, TypeScript.
- Express API path: Node.js, Express and MySQL; retained as a local/legacy implementation.
- Cloudflare Worker path: TypeScript Worker with D1, KV and Queues; this is the currently deployed API path for the Cloudflare deployment workflow.
- Data: CSV upload, profiling, cleaning, validation and background jobs exist across the two paths, but their storage and schemas are not interchangeable.
- BI: organization-scoped Power BI report-link catalog. Secure Power BI embedding and automatic dataset refresh are not implemented.
- Storage: Worker bindings/configuration must be checked for the active deployment. Do not assume local Express disk storage is production object storage.

**Deployment caution:** both application paths are present. The Cloudflare Worker and Express/MySQL implementations have different route coverage and role/data models. Confirm the target path before changing schema, storage, job scheduling or data generation.

## Existing implementation foundation
- Registration, email verification, login, session handling and password recovery.
- Organizations, membership roles, access requests, invitations and membership management.
- Projects, tasks, statuses, priorities, assignees and due dates.
- CSV dataset catalog, preview, Python cleaning, profiling and validation.
- Immutable dataset versions, version comparison and restore-as-new-version.
- Quality/anomaly history and organization audit events.
- In-app notifications and Power BI report-link catalog.
- Worker background profiling and synthetic-data job queues.

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
### Cloudflare Worker organization roles
The deployed Worker path enforces four roles:
- OWNER: organization owner; manages sensitive settings, invitations and role changes.
- MANAGER: read-only organization reporting and access-request visibility.
- LEADER: leads one team and assigns work within that team.
- ANALYST: completes assigned work.

### Legacy Express/MySQL path
The local/legacy Express path may still contain older role names and permission behavior. Do not assume its role enforcement matches the Worker. Keep changes path-specific until parity tests prove otherwise.

### Trainer access recommendation
Start with limited Reviewer/Mentor access to approved project information. Project-scoped reviewer permissions still need implementation before being promised as a live feature. Do not grant platform-wide administrator rights by default.

## Approval gates
1. Proposal and scope prepared.
2. Trainer/institution approves objectives, industries, data rules, workload and tools.
3. Participant count and consent confirmed.
4. Invitations and memberships activated.
5. Teams, leads, tasks and project permissions configured.
6. Operational launch after storage, security and performance checks.

No team, participant, trainer account or recurring generation schedule is created by the blueprint itself.

## Data lifecycle
Requirements → Discovery → Ingestion → Profiling → Cleaning → Validation → SQL/Python → Dashboarding → QA/Reconciliation → Insights → Review → Delivery → Monitoring.

Raw files remain immutable. Cleaning and validation create versioned outputs. Every handoff should record dataset version, owner, status, checks performed and approval. Use synthetic or formally approved de-identified data; do not introduce real patient, bank-customer or payment-card data without authorization and safeguards.

## Synthetic data generation
Generation is owner-controlled and approval-gated. The Cloudflare Worker has queued generator jobs and bounded limits, but large-scale scheduled generation, durable retention, multi-table relational generation and load testing remain outstanding. Never generate a large batch synchronously in a web request.

## Security and production gaps
- Project-scoped roles and dataset/column-level access controls.
- Durable private object storage and retention/lifecycle policy verification.
- Approved database/API connectors with least-privilege credentials.
- Safe concurrent editing, conflict handling and lineage.
- Secure Power BI embedding and token lifecycle.
- CSRF review, MFA, tenant-isolation tests and independent security review.
- Backups, restore drills, monitoring, alerting and secret management.
- Load tests for large datasets and dashboard responsiveness.

Do not claim these gaps are already implemented.

## Trainer presentation
See [Trainer Proposal](TRAINER_PROPOSAL.md), [Platform Blueprint](PLATFORM_BLUEPRINT.md), [Role Governance](ROLE_GOVERNANCE.md), [Industry Data Catalog](INDUSTRY_DATA_CATALOG.md) and [Data Generation Specification](DATA_GENERATION_SPEC.md).
