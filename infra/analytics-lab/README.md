# VYRON Real Desktop Lab — isolated proof of concept

This uses the LinuxServer Webtop XFCE container image: a real Linux desktop streamed through a browser, not a fake terminal. It is a standalone proof-of-concept and is **not integrated with VYRON's organization, assignment, session or audit APIs yet**.

## Requirements
- Docker Engine + Compose plugin on a Linux host.
- Host capacity; the compose configuration reserves limits of 2 CPU, 2 GB RAM and 1 GB shared memory (actual needs depend on the workload).
- Keep this on a host you control.

## Start
1. Copy `.env.example` to `.env`; change `LAB_PASSWORD` to a strong random password.
2. Run `docker compose up -d`.
3. Open `http://127.0.0.1:3001` on the host.
4. The desktop workspace is persisted in `./workspace` on the host.
5. Stop using `docker compose down`; files remain in the workspace folder.

## Security caveats
- Port is bound to loopback only. Do not change this to a public binding unless an authenticated TLS reverse proxy, firewall and access controls are in place.
- This prototype has no VYRON single sign-on, org membership check, per-analyst provisioning, remote lifecycle control or API audit integration.
- Container isolation is not equivalent to a VM; do not run untrusted workloads on a shared or production host.
- The compose configuration is a demonstration. Review image versions and security settings for the deployment environment; pin a verified digest before production.
- Keep credentials in the untracked `.env`; never commit them.
- For real multi-tenant use, each lab needs a separate runtime, storage scope, network policy, lifecycle controller and session authorization.

## Integration target
VYRON's control-plane records and API contract are documented in `docs/ANALYTICS_LAB_CONTROL_PLANE.md`. A private compute controller will eventually provision and manage lab instances. This compose file is an initial host-based validation path only.
