# ISO build strategy and validation gates

## Current state
The current build script is an experimental Debian live-build configuration targeting Ubuntu Noble. Ubuntu's image pipeline also uses live-build through Ubuntu-specific livecd-rootfs overlays and configuration. A generic `lb config` invocation is not proof that the resulting image will have Ubuntu's expected casper/live installer behavior.

## Recommended validation path
1. Keep the current prototype isolated on `vyron-os-foundation`.
2. Prefer customizing a verified Ubuntu/Xubuntu live ISO or Ubuntu-supported livecd-rootfs configuration over treating generic Debian live-build settings as sufficient.
3. Validate package selection against Noble repositories on an Ubuntu 24.04 build host.
4. Build the ISO and inspect boot structure; then test UEFI and BIOS boot, live session, networking, installer, branding and security baseline in a disposable VM.
5. Only promote a build after repeatable VM testing and recording checksums.

## CI limits
Structural CI validates shell syntax, hooks, assets and package-manifest naming. Its package candidate audit is advisory and its runner's repository context is not a definitive Noble package-resolution test. CI is not a successful ISO build or VM test.


## Release evidence checklist (record for each candidate)

Create a candidate directory outside the source checkout and keep the original Ubuntu ISO unchanged. Record the exact source ISO filename, official download page, checksum verification evidence, builder OS release, free disk space, commit SHA, package list, output ISO SHA256 and VM test results.

- [ ] Source ISO checksum and signature independently authenticated against Ubuntu's official publication.
- [ ] Builder host is Ubuntu 24.04 and passes `bash vyron-os/scripts/builder-host-check.sh` (100 GiB default free-space threshold; override only for a deliberately smaller, non-release experiment).
- [ ] Builder storage capacity is sufficient for extraction, squashfs rebuild and ISO output (plan for at least 100 GiB free).
- [ ] Customization actions are reviewed before execution; no unreviewed privileged scripts or YAML.
- [ ] Output ISO exists and is inspected with `bash vyron-os/scripts/inspect-iso.sh PATH_TO_ISO`.
- [ ] Output SHA256 is recorded; candidate is not labelled release-ready before VM validation.
- [ ] UEFI and BIOS boot paths are tested in a disposable VM, where supported.
- [ ] Login, XFCE session, onboarding, networking, shutdown/reboot and installer flow are tested.
- [ ] Findings, screenshots/logs and test date are saved alongside candidate metadata.

This checklist is evidence tracking, not a claim that any gate has been completed. Do not use an untested candidate on primary hardware.
