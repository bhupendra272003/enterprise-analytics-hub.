# Local group and workspace directory initialization

The live chroot hook `0800-vyron-local-groups.hook.chroot` establishes the following idempotently:

- Local system groups for owner, manager, leader, analyst, users, data and audit.
- `/srv/vyron/shared`: root-owned, setgid directory with group `vyron-data`, mode 2770.
- `/var/log/vyron`: root-owned audit-group directory, mode 0750.
- `/etc/vyron`: root-owned, vyron-users group, mode 0750.

## Limitations and next steps

- No users, passwords or role memberships are baked into the ISO.
- The group setup does not grant OS sudo rights to roles and does not enforce app-level RBAC.
- Installer/admin provisioning must assign each person's role group and validate permissions.
- The shared directory is only a local filesystem scaffold; tenant/data access must still be enforced in application services and tests.
- The hook is syntactically reviewed by CI but not yet run in a live Ubuntu image.


## Automated hook tests

`scripts/test-local-groups-hook.sh` runs the group hook using mocked `getent`, `groupadd`, and `install` commands. It verifies the expected group set, directory-command count, and idempotent second run without touching host groups or directories. This is a mocked test, not a real installation/permission validation.
