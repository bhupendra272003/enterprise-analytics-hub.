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
2. Run `sudo bash scripts/prepare-host.sh` to install ISO-building prerequisites.
3. Run `bash scripts/builder-host-check.sh` from the OS folder (read-only readiness check; set `VYRON_BUILD_DIR` if needed).
4. The ISO builder remains experimental; validate build artifacts and test in a disposable VM before installation.

## Security notes
Linux groups alone do not implement application RBAC. USB blocking is not a complete data-loss-prevention system. Role policy, file permissions, application controls, audit logs and encryption must be tested together. Never test the installer on a machine with valuable data without backups.

## Base ISO intake (authenticated, evidence-first)

The intake pipeline is deliberately fail-closed. Before running it, obtain the ISO,
checksum manifest, detached signature and signing-keyring from the official Ubuntu
release channels, and independently confirm the signing-key fingerprint using
Ubuntu's published guidance. Do not treat a fingerprint copied only from a file
in this repository or from the same download as independent verification.

On a dedicated Ubuntu build host, after confirming the fingerprint out-of-band:

```bash
export VYRON_EXPECTED_SIGNING_FINGERPRINT='YOUR independently verified fingerprint'
mkdir -p ~/vyron-candidates
sudo bash scripts/prepare-host.sh
bash scripts/intake-base-iso.sh /path/to/ubuntu.iso /path/to/SHA256SUMS /path/to/SHA256SUMS.gpg /path/to/trusted-keyring.gpg ~/vyron-candidates/ubuntu-intake
```

Use the correct repository folder when invoking the script. Intake authenticates the
checksum manifest, verifies the ISO hash, performs read-only inspection, and records
evidence in a new candidate workspace. It refuses overwrite and symlink inputs.
Mocked fixtures in CI test failure handling only; they are not authentic release
inputs. Intake evidence does not certify customization compatibility, installation,
or bootability.


## Analytics workstation quick start

See [Analytics Quick Start](docs/ANALYTICS-QUICKSTART.md) for the intended analyst workflow and security/account guidance. This documentation does not imply that the ISO has been built or boot-tested.
