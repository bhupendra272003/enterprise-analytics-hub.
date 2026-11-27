# VyronOS first-user setup

This is the current manual onboarding path for a built image; installer integration is still pending.

1. Boot and install the image only in a disposable VM until the ISO is validated.
2. Log in to a local console as root or use a trusted root shell.
3. Confirm the local-groups image hook ran: `getent group vyron-users`, `vyron-analyst`, `vyron-owner`, `vyron-manager`, and `vyron-leader`.
4. On XFCE, double-click **Setup Workstation User** on the desktop, or run `sudo vyron-first-user` from a terminal (the image hook installs this command).\n5. If using the desktop launcher, authenticate at the sudo prompt in the terminal.
6. Choose a username, full name and role; review the confirmation before proceeding.
7. Set the account password through the interactive `passwd` prompt.
8. Verify the assigned role with `id USERNAME` and confirm the account can log in.

## Important limitation
The image hook now installs the helper and role-assignment script in `/usr/local/lib/vyron/scripts` and creates `/usr/local/sbin/vyron-first-user`. Installer-driven account creation is still pending; the desktop now provides a launcher for the existing interactive provisioning tool. The role groups provide coarse local grouping only and do not themselves enforce application permissions.

Never use a production machine for unvalidated installer testing; back up data and use a disposable VM.
