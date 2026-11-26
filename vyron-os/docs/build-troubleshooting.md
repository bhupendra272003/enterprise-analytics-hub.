# Build troubleshooting — Bhupendra VyronOS

This document collects safe, repeatable recovery steps for the live-build prototype.

## Before a build
- Use a dedicated Ubuntu 24.04 amd64 host/VM, not the production machine.
- Check disk space (large package sets may require many GB); avoid filling the system disk.
- Run `bash vyron-os/scripts/validate-config.sh` and resolve structural errors.
- Ensure host packages and repository metadata are current. Package checks against a host cache are advisory.

## Build directory behavior
The build script deliberately refuses to reuse an existing directory. If a previous build failed, preserve its logs before cleaning. Set `VYRON_BUILD_DIR` to a new empty path for a fresh attempt; do not delete arbitrary paths.

Example:
```bash
VYRON_BUILD_DIR="$HOME/vyronos-build-clean" bash vyron-os/scripts/build-iso.sh
```

## Common failure classes
- **Package not found:** package names or repository components may not match Ubuntu Noble. Check the exact package against enabled Noble repositories; do not assume the host cache matches the target.
- **Network/apt failure:** retry after checking DNS, connectivity and repository mirror health. Preserve logs.
- **Insufficient storage:** use a dedicated build volume and confirm free space before retrying.
- **live-build option error:** capture `lb config --help` and the exact command output; revise configuration only against the installed live-build version.
- **Hook failure:** inspect the first failing hook and chroot log. Make hooks idempotent and avoid setting passwords or creating privileged accounts during image build.
- **ISO appears successful but won't boot:** inspect boot metadata, then test in QEMU/VirtualBox before any hardware install.

## Validation status
These instructions are diagnostic guidance only. No ISO has been built or boot-tested as part of this repository work yet.
