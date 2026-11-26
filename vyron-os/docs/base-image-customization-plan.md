# Base-image customization pipeline decision

## Selected direction
VyronOS will customize a supported Ubuntu 24.04 Desktop live ISO as its base instead of constructing boot/install media from a generic Debian live-build configuration.

Ubuntu's documentation identifies `livecd-rootfs` as its image creation machinery and recommends customization of existing installer images using LiveFS Editor for many use cases. The canonical Ubuntu CD image pipeline is more complex than invoking generic `lb config`.

## Practical workflow (planned)
1. Download a verified Ubuntu 24.04 Desktop ISO from an official source; verify its checksum/signature.
2. Run customization on a dedicated Ubuntu 24.04 VM/host with ample disk space (recommend 100 GB+ for ISO customization workflows).
3. Use LiveFS Editor or a documented compatible workflow to add packages, hooks, branding and defaults.
4. Keep installer, casper, kernel and initramfs components intact unless an explicit validated change requires rebuilding them.
5. Generate image, checksum, inspect files, and VM-test both BIOS/UEFI where supported, plus installer and live session.
6. Never use this pipeline on the host's system image or production disk; build in an isolated workspace.

## Package sourcing
The current packages manifest remains a desired package set, not yet a dependency-resolved install list. Vendor-specific software must be packaged separately. We should not assume MySQL Workbench, Python Jupyter packages, or all XFCE extras resolve identically on Noble without testing.

## Prototype status
This is a design decision and safety checklist. No base ISO has been downloaded, modified, or generated in this repository workflow, and no VM test has occurred.
