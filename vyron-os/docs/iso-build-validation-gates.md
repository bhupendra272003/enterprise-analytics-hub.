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
