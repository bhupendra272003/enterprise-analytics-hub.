# Local Role Assignment (VyronOS)

The `scripts/assign-role.sh` utility assigns an existing, individually provisioned Linux account to one local Vyron role group and the common `vyron-users` group.

## Usage

Preview without system changes:

```bash
bash scripts/assign-role.sh --dry-run bhupendra analyst
```

The argument order is `USER ROLE`.

Apply as root only after the account exists and the image has the required groups:

```bash
sudo bash scripts/assign-role.sh bhupendra analyst
```

Roles accepted: `owner`, `manager`, `leader`, `analyst`. The helper rejects unknown roles and conflicting multi-role assignments. It does not create accounts, passwords, sudo policy, or application privileges.

## Boundaries and next steps

- Group membership is a local, coarse-grained identity aid—not full RBAC.
- It does not yet provision organizations, app users, workspace memberships, datasets, or permissions.
- It grants no sudo privileges.
- Account creation, authentication, recovery, and app authorization require a separate reviewed implementation.
- CI tests include an isolated mock-mode execution path for the two expected `usermod` calls and a conflict rejection case; mocked commands prevent host changes. This does not validate behavior on a real Ubuntu host.
