# Boot menu branding — prototype

Hook `0600-vyron-grub-settings.hook.chroot` writes conservative GRUB defaults for installed systems, including menu visibility, timeout and disabling recovery menu entries.

**Limitations:** This does not yet modify the live ISO's GRUB menu artwork or theme. It does not run update-grub inside the image build. ISO boot menu appearance must be validated and configured through live-build bootloader-specific configuration after an ISO test.
