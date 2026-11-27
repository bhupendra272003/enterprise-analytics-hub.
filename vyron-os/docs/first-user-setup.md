# VyronOS first-user setup

This is the current manual onboarding path for a built image; installer integration is still pending.

1. Boot and install the image only in a disposable VM until the ISO is validated.
2. Log in to a local console as root or use a trusted root shell.
3. Confirm the local-groups image hook ran: `getent group vyron-users`, `vyron-analyst`, `vyron-owner`, `vyron-manager`, and `vyron-leader`.
4. Run `sudo vyron-first-user` from a root console (the image hook installs this command).
5. Choose a username, full name and role; review the confirmation before proceeding.
6. Set the account password through the interactive `passwd` prompt.
7. Verify the assigned role with `id USERNAME` and confirm the account can log in.

## Important limitation
The image hook now installs the helper and role-assignment script in `/usr/local/lib/vyron/scripts` and creates `/usr/local/sbin/vyron-first-user`. Installer-driven account creation and desktop onboarding are still pending. The role groups provide coarse local grouping only and do not themselves enforce application permissions.

Never use a production machine for unvalidated installer testing; back up data and use a disposable VM.
