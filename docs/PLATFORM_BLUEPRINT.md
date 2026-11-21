# Bhupendra's Vyron — Platform Blueprint

## Purpose
Bhupendra's Vyron is a governed, multi-industry analytics and collaboration workspace. It is intended to help a learning group or organization complete a realistic analytics lifecycle using shared datasets, controlled access, clear ownership, review gates and documented outputs.

Vyron is not limited to a fixed team size or a fixed number of industries. Organization setup, team count, responsibilities and project scope are configurable after the owner receives approval from the relevant trainer or institution.

## Current project foundation
The repository already contains an initial implementation of:
- Account registration, email verification, login and password recovery.
- Organizations, membership roles, access requests and one-time invitations.
- Project and task tracking with assignees, statuses, priorities and due dates.
- CSV dataset upload, previews, Python-based cleaning, profiling and validation.
- Immutable dataset versions, comparisons, restore-as-new-version and audit history.
- Power BI report-link catalog and in-app notifications.

These are foundations, not a claim of production certification.

## Target platform modules
1. **Overview:** organization/project health, work in progress, due dates, data quality and recent activity.
2. **Industry & Dataset Catalog:** industry templates, dataset definitions, relationships, sensitivity labels, owners and refresh history.
3. **Data Workspace:** ingestion, profiling, cleaning, validation, versioning, SQL/Python analysis and governed exports.
4. **Project Delivery:** milestones, tasks, dependencies, handoffs, review requests, approvals and deliverables.
5. **People & Governance:** invitations, access requests, organization roles, project responsibilities, dataset permissions and audit.
6. **BI & Reporting:** report catalog, KPI definitions, insight summaries and later secure embedding.
7. **Automation & Operations:** scheduled synthetic data generation, background jobs, run history, retry controls and alerts.
8. **Trainer / Reviewer View:** an explicitly granted, limited view for project review; no automatic administrator rights.

## Organization setup is approval-gated
Before any participant onboarding:
- The owner prepares a proposal and demonstrates the platform.
- The trainer/institution confirms whether the project may proceed and any data, privacy, time or participant rules.
- The owner records the approved scope, participant count, industries, schedule and supervision model.
- Only then are invitations, teams and assignments created.

No team, member, trainer account, role assignment or scheduled data generation is created automatically by this blueprint.

## Scale and team design
Team count is based on actual confirmed participants and trainer guidance. The earlier four-industry/four-team concept is an example, not a fixed commitment. A small cohort can work as one project team; a larger cohort can split by industry, dataset or lifecycle stage. Roles may be combined when the group is small and rotated for learning.

## Daily operating model
The proposed learning constraint is a maximum of two hours per participant per day. A typical session can include:
- Briefing and priorities.
- Focused assigned work.
- Peer review and dataset handoff.
- Short learning note and progress update.

The schedule is a proposal and must be approved before it becomes a recurring operating rule.

## Data policy
- Initial dataset generation must use synthetic or properly de-identified data.
- Never use real patient, bank-customer, payment-card or other personal data without formal authorization, legal basis, security controls and trainer/institution approval.
- Synthetic datasets must be clearly labelled and documented.
- Raw, cleaned, validated and approved outputs remain distinguishable.
- Source files are immutable; transformations create new versions.
- Dataset access follows least privilege.
- Exports must be reviewed for sensitive columns before sharing.

## Large dataset generation proposal
The previously discussed capacity target was 50,000+ initial rows and 10,000+ daily additions. The interpretation (per industry versus across the whole program) must be confirmed before activation. The generator must be configurable, chunked, idempotent, queued and load-tested. It must not synchronously insert large batches during a web request. A daily schedule remains disabled until storage, cost, throughput and trainer approval are confirmed.

## Important implementation boundaries
The existing application has a local-disk CSV storage path in its Express implementation and a Cloudflare Worker/D1/Queue path in the repository. Deployment routing and the active data path must be verified before large-scale generation or shared editing is enabled. Durable private object storage, robust concurrent editing, granular project-level permissions, secure BI embedding, backups, monitoring and independent security review remain explicit engineering work.

## Success criteria
- A trainer can understand the purpose, workflow, responsibilities, privacy controls and learning outcomes.
- Participants can join only after approval and receive the minimum access needed.
- Each dataset has provenance, version history and quality evidence.
- Work can be handed off with a clear owner and review state.
- Dashboards reconcile to documented source data and queries.
- The project can scale up or down without assuming a fixed number of people.
