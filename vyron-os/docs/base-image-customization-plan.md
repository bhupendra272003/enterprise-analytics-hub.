# Base-image customization pipeline decision

## Selected direction
VyronOS will customize a supported Ubuntu 24.04 Desktop live ISO as its base instead of constructing boot/install media from a generic Debian live-build configuration.

Ubuntu's documentation identifies `livecd-rootfs` as its image creation machinery and recommends customization of existing installer images using LiveFS Editor for many use cases. The canonical Ubuntu CD image pipeline is more complex than invoking generic `lb config`.

## Practical workflow

A guarded wrapper now exists at `scripts/customize-base-iso.sh`. It requires a source ISO, destination path, reviewed LiveFS Editor YAML, the authenticated intake workspace, and the trusted keyring. It matches the source path and SHA256 to the intake evidence, checks the pinned signing-key fingerprint, and re-runs signature plus checksum verification immediately before customization. It also checks source/destination separation, tools and free disk space (100 GiB by default; configurable via `VYRON_CUSTOMIZE_MIN_FREE_GB`) and requires typed confirmation. This is defense-in-depth, not proof of LiveFS Editor compatibility or an end-to-end validated pipeline.
1. Download a verified Ubuntu 24.04 Desktop ISO from an official source; verify its checksum/signature.
2. Run customization on a dedicated Ubuntu 24.04 VM/host with ample disk space (recommend 100 GB+ for ISO customization workflows).
3. Prepare and review a LiveFS Editor action YAML; use the guarded wrapper with the intake workspace and same trusted keyring (see `docs/base-iso-inspection.md`). The precise desktop squashfs targets and branding action sequence still require test validation.
4. Keep installer, casper, kernel and initramfs components intact unless an explicit validated change requires rebuilding them.
5. Generate image, checksum, inspect files, and VM-test both BIOS/UEFI where supported, plus installer and live session.
6. Never use this pipeline on the host's system image or production disk; build in an isolated workspace.

## Package sourcing
The current packages manifest remains a desired package set, not yet a dependency-resolved install list. Vendor-specific software must be packaged separately. We should not assume MySQL Workbench, Python Jupyter packages, or all XFCE extras resolve identically on Noble without testing.

## Current implementation status
- `scripts/customize-base-iso.sh`: guarded wrapper now requires and re-verifies authenticated intake evidence; not yet executed on an Ubuntu builder.
- No validated action YAML for the Desktop image has been committed yet, because target squashfs/layer naming must be confirmed against a real base ISO.
- ISO creation and boot/install validation remain outstanding.

## Prototype status
This is a design decision and safety checklist. No base ISO has been downloaded, modified, or generated in this repository workflow, and no VM test has occurred.
