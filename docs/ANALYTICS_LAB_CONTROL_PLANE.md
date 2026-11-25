# Analytics Lab Control Plane API Contract

This contract is infrastructure-neutral. The API must not execute shell commands, notebooks, Python, or container-runtime requests itself. A separately isolated compute adapter/controller is responsible for runtime operations.

## API routes (session-authenticated, organization-scoped)
- `GET /api/organizations/:orgId/labs`: OWNER/MANAGER inventory; LEADER sees team/project-scoped labs; ANALYST sees labs explicitly granted to them.
- `POST /api/organizations/:orgId/labs`: OWNER provisioning request. Validates org policy, template allow-list, quota, and optional project/task context.
- `GET /api/labs/:labId`: authorized lab metadata only; never exposes provider secrets or host paths.
- `POST /api/labs/:labId/start`, `/stop`, `/reset`: owner lifecycle actions; analysts may start/stop only labs assigned to them if policy explicitly permits.
- `POST /api/labs/:labId/access`: OWNER grants/revokes; LEADER can grant task-limited analyst access only when an Owner policy explicitly allows it.
- `POST /api/labs/:labId/submissions`: ANALYST submission metadata and deliverable references; no arbitrary file path.
- `GET /api/labs/:labId/events`: org-scoped audit log, role-filtered.

## Compute adapter
A private service/controller (not publicly reachable) receives signed, short-lived lifecycle requests. It must:
- provision from pinned, reviewed templates and images;
- isolate each lab, prohibit privileged containers and host mounts, restrict outbound network and metadata-service access;
- use CPU, memory, disk and wall-clock limits;
- store data on per-lab persistent volumes with access controls;
- avoid returning host/provider credentials to the browser;
- expose desktop streaming through authenticated, expiring sessions;
- support idle shutdown, controlled reset, backup/export, and deletion;
- report state back to the API using authenticated service credentials and idempotency keys.

## Governance and audit
- Verify active membership and role server-side on every action; never trust UI role flags.
- OWNER is organization-level policy and provisioning authority.
- LEADER is restricted to their assigned teams/tasks and may not create organizations, alter org policy or provision unless delegated.
- ANALYST can access only explicitly assigned labs/tasks and submit work.
- MANAGER is read-only.
- Record provisioning, launch, stop, reset, access grant/revoke, quota changes, submission and review events.
- Re-check permissions at stream/session issuance and revoke promptly.
- Lab provisioning requires a policy-approved template, resource cap, expiry and provider configuration.
- Never embed provider tokens or lab credentials in frontend bundles or logs.

## Provider status
The migration adds control-plane records only. No compute provider has been selected, configured, or provisioned by this change. Provider availability, pricing, storage, streaming, and security must be verified before claiming a live VM.
