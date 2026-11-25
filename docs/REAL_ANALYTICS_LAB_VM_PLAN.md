# VYRON Real Analytics Lab & Virtual Desktop

## Product goal
Deliver a real, browser-accessible, persistent Linux learning workspace inside the existing organization-governed VYRON product. This is not a visual mock terminal or iframe-only demo.

## Governance (preserve current roles)
- OWNER: controls organization, lab policies, member access, quotas, projects and lab provisioning.
- LEADER: creates assignments, defines acceptance criteria, assigns datasets and reviews submissions. No organization-wide owner actions.
- ANALYST: can use assigned lab(s), project datasets and submission workflow; no provisioning/admin rights.
- MANAGER: read-only reporting/access where currently defined by platform policy.
- Every lab launch, stop, resource change, assignment submission, review and access revocation should be auditable and organization scoped.

## Target experience
- Browser remote desktop with a real Linux desktop shell (XFCE/lightweight desktop).
- Real terminal, Python 3, pip/venv, JupyterLab, Git and a code editor.
- SQL engine (initially SQLite for lab-local work; optional managed MySQL/Postgres service in a later stage).
- Import/export of CSV/XLSX, project files and notebooks; durable workspace storage.
- Analytics practice initially uses open-source visualization tools (Python plotting, notebooks and browser BI tool), not an implication that Microsoft Power BI Desktop is running.
- Task workspaces seeded with company-style scenarios, datasets, SOPs and acceptance criteria.
- Save snapshots/checkpoints, persist files between sessions, reset lab safely and track usage.
- Isolate execution: do not run analyst code inside the Next.js app, Cloudflare Worker, or shared API process.

## Infrastructure strategy
Cloudflare is retained for frontend/API only where it fits. Desktop and code-execution service is separately deployed compute with persistent storage. Select VM/container provider based on free/low-cost feasibility, browser streaming, persistence, lifecycle control, security and reliability. Avoid promising unlimited free compute.

## Staged implementation
1. Architecture inventory and provider feasibility: establish current API/auth/session boundaries, deployment constraints and compute options.
2. Lab control plane: API records for lab lifecycle, organization/project membership, limits, audit events and authorization. OWNER/LEADER/ANALYST access enforced server-side.
3. Compute prototype: isolated container/VM, Linux desktop via browser streaming, provisioned Python/Git/SQLite/Jupyter/editor, no public unauthenticated access.
4. Persistence & lifecycle: durable workspace volume, start/stop/reset, idle timeout, backup/export and quota checks.
5. Integration: VYRON lab launcher, project/task context, seeded dataset, analyst submission and leader review.
6. Hardening and testing: isolation, access revocation, secrets, rate/resource limits, tests, CI, deployment and smoke test.

## Initial prototype status
The /workspace/vm route currently links to an externally hosted v86 Alpine emulator. It is a temporary learning/demo prototype only: it is not a managed persistent VM and its iframe/live functionality has not been verified. Do not treat this as the target implementation.
