# VyronOS validation checklist

## Build host
- [ ] Dedicated Ubuntu 24.04 build VM/host; do not build on production machine.
- [ ] Confirm available disk space and memory.
- [ ] Refresh apt metadata and review Noble package availability.
- [ ] Run `bash vyron-os/scripts/preflight.sh`.
- [ ] Review package list, hook scripts, and live-build config.

## ISO creation
- [ ] Run `bash vyron-os/scripts/build-iso.sh`.
- [ ] Confirm build ends successfully and ISO artifact is present.
- [ ] Run `bash vyron-os/scripts/inspect-iso.sh /path/to/image.iso`.
- [ ] Save SHA-256 checksum with test notes.

## VM testing (not yet performed)
- [ ] UEFI boot.
- [ ] Legacy BIOS boot if supported by generated image.
- [ ] XFCE session and display resolution.
- [ ] Network manager and Wi-Fi handling.
- [ ] Wallpaper and branding.
- [ ] MPV launcher is opt-in and doesn't automatically cover desktop.
- [ ] LibreOffice Calc.
- [ ] Python environment and notebooks.
- [ ] MySQL server/workbench startup and first-run behavior.
- [ ] USB/storage detection, shutdown, restart.
- [ ] Security baseline and firewall review.
- [ ] Verify no privileged role policies are represented as enforced until app/backend checks exist.

Never install an untested ISO on the main machine. This checklist is a planned test suite, not evidence of completed tests.
