# Bhupendra VyronOS — Security baseline

This is an initial, reviewable baseline—not a hardened or certified system.

## Apply
On a supported Ubuntu host/installation, review the script and execute:
```bash
sudo bash scripts/apply-security-baseline.sh
```

## Verify
```bash
sudo bash scripts/verify-security-baseline.sh
sudo ufw status verbose
sudo aa-status
sudo systemctl status auditd --no-pager
```

## Important cautions
- UFW defaults deny unsolicited inbound connections; if remote administration is needed, configure and test its allow rule before enabling the firewall, or you may lock yourself out.
- SSH root login drop-in is written only if the SSH config drop-in directory exists and is validated before reload.
- USB-storage restrictions are not yet implemented; disabling storage modules can disrupt devices and is not a complete data-loss prevention measure.
- AppArmor and auditd are enabled, but meaningful application-specific rules and audit policies still require design and testing.
- Automatic updates are installed/enabled but their effective settings should be checked on the target system.
- Prefer full-disk encryption during OS installation. Do not put secrets or real client data into the ISO.
- These scripts have not yet been run on a physical or virtual Ubuntu target. Commit status is not test status.

## Read-only posture check

Run the newer diagnostic script without applying changes:
```bash
bash scripts/check-security-posture.sh
```
It checks firewall defaults and active services, and evaluates effective SSH root-login policy when sshd is present. It is a diagnostic aid only.
