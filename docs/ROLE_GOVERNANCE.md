# Vyron — Roles, Permissions & Approval Governance

## Principles
1. Keep platform administration separate from organization and project responsibilities.
2. Grant the minimum access required for a task.
3. A title such as Trainer, Mentor or Team Lead does not automatically grant technical permissions.
4. All privileged changes must be attributable and auditable.
5. Team creation and onboarding remain disabled until the project scope is approved.

## Role layers

### Platform role
Controls platform-wide operations (for example, platform owner/operator). This role is not a normal organization membership role and must be assigned only to a trusted operator.

### Organization role
The current application supports:
- **OWNER:** accountable organization owner; approves scope, administrators and sensitive access.
- **ADMIN:** manages organization settings and members within owner-defined limits.
- **MANAGER:** coordinates projects, tasks, workload and review queues.
- **ANALYST:** works on authorized datasets, analysis and assigned tasks.
- **VIEWER:** read-only access to permitted organization resources.

The existing application enforces these organization roles in API routes. Do not assume this automatically provides column-level or project-level isolation.

### Project responsibility (target design)
These are responsibilities, not organization roles:
- Project Lead: plans milestones, coordinates delivery and reports progress.
- Data Engineer / Data Steward: ingestion, schema, provenance and data quality.
- Data Cleaner: cleaning rules and transformation notes.
- Analyst: SQL/Python exploration and business questions.
- BI Developer: data model, measures, dashboards and narrative.
- QA / Reviewer: checks reproducibility, data quality and reconciliation.
- Trainer / Mentor: reviews learning outcomes and deliverables if invited.

One person may hold multiple responsibilities in a small cohort. Responsibilities can rotate between sprints.

## Trainer participation options
The owner should ask the trainer which involvement model they prefer.

| Option | Intended access | When appropriate |
|---|---|---|
| External reviewer / mentor | Read-only project overview, approved datasets and deliverables; comments/review if supported | Trainer supervises but does not operate the workspace |
| Project manager | Project milestones, task coordination and review queue; no platform-wide settings by default | Trainer agrees to coordinate daily work |
| Organization admin | Member invitations and organization settings within the defined scope | Only if trainer explicitly accepts administrative responsibility |
| Platform admin | Cross-organization technical controls | Not recommended for a trainer by default |

**Recommendation:** Start with reviewer/mentor access. Promote to Manager only if the trainer wants to manage delivery. Grant Admin only after explicit approval and a clear responsibility agreement. Keep the OWNER role with the project owner unless formal ownership changes.

## Approval gates
- Gate 0 — Proposal: scope, objectives, industries, tools, participant model and risks documented.
- Gate 1 — Trainer/institution approval: approval, conditions and supervisor recorded.
- Gate 2 — Data approval: synthetic/de-identified policy and dataset boundaries confirmed.
- Gate 3 — Participant onboarding: actual participants and consent confirmed; invitations issued.
- Gate 4 — Team/project setup: team count, leads, roles, task schedule and access reviewed.
- Gate 5 — Operational launch: storage, backups, access tests and workload tests passed.

## Access request lifecycle
Requested → Pending review → Approved or Rejected → Active membership (if approved) → Suspended or Revoked (if required).

An email verification proves control of an email address; it does not itself grant organization access. Membership approval and project/dataset permissions remain separate decisions.

## Required audit events
Record actor, timestamp, target, action and safe metadata for:
- Invitations created, accepted, expired or revoked.
- Access requests approved or rejected.
- Role changes and membership suspension.
- Project/task assignment and completion.
- Dataset upload, new version, cleaning, validation, export and restore.
- Review and approval decisions.
- Scheduled generation runs, failures, retries and cancellations.

Never log passwords, raw invitation tokens, session identifiers or sensitive dataset values.

## Current implementation gap
The current schema has organization-level membership roles and task assignees. Project-scoped roles, dataset-level ACLs, column masking and trainer-specific reviewer permissions are target capabilities and must be implemented and tested before promising them as available.
