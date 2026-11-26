# Vyron OS — Foundation

Vyron OS is a planned Ubuntu 24.04 LTS + XFCE analytics workstation distribution for the VYRON training/work environment.

This repository currently contains the build scaffolding and host preparation scripts. It is **not yet a bootable ISO or a hardened operating system**.

## Direction
- Ubuntu 24.04 LTS base, XFCE desktop
- Royal dark login branding with a gold lion and Bhupendra signature
- Role-oriented accounts (OWNER, MANAGER, LEADER, ANALYST)
- Analytics stack: Python, Jupyter, MySQL, Git, LibreOffice, VS Code and DBeaver (vendor sources may be required)
- Local Hub services managed by systemd
- Security layers: UFW, AppArmor, auditd, least privilege and export controls

## Build overview
1. Use a dedicated Ubuntu 24.04 build host or VM.
2. Run `scripts/prepare-host.sh` to install ISO-building prerequisites.
3. Build configuration and live image scaffolding will be added next.

## Security notes
Linux groups alone do not implement application RBAC. USB blocking is not a complete data-loss-prevention system. Role policy, file permissions, application controls, audit logs and encryption must be tested together. Never test the installer on a machine with valuable data without backups.
