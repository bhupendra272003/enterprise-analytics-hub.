# Ubuntu Desktop remaster route

## Preferred fallback for the Desktop ISO
Ubuntu's Community Help Wiki documents remastering an existing Desktop LiveCD by extracting its ISO tree, unpacking `casper/filesystem.squashfs`, modifying the root filesystem, rebuilding the SquashFS and filesystem-size metadata, and replaying the original ISO boot options using xorriso.

This is a legacy/community procedure (the page example is older than Noble), not an officially supported release pipeline. We must validate it against the exact Ubuntu 24.04 ISO before automating it.

## Build gates
1. Use an isolated Ubuntu 24.04 builder with 100GB+ storage and 4GB+ RAM (more recommended).
2. Download official Ubuntu Desktop ISO and verify SHA256SUMS and signature from the official release directory.
3. Inspect boot parameters using `xorriso -indev BASE.iso -report_el_torito cmd`.
4. Extract the image tree without altering the original ISO.
5. Mount/unpack the `casper/filesystem.squashfs` and prepare modifications in a disposable rootfs workspace.
6. Maintain the Ubuntu installer components and existing boot configuration. Do not assume the ISO boot command is portable between point releases.
7. Rebuild squashfs and update `casper/filesystem.size` and manifest files if rootfs packages were changed.
8. Reassemble by replaying boot metadata from the original image, then inspect output.
9. VM test UEFI and installer, live session, persistence, networking and applications.

## Status
No source ISO has been downloaded or remastered in this project session. This route is a researched fallback with validation gates; not a claim of a working ISO pipeline.
