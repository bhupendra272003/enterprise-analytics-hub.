# Read-only base ISO inspection

Before writing a LiveFS Editor action file, inspect the exact ISO supplied to the isolated builder:

```bash
bash vyron-os/scripts/inspect-base-iso.sh /path/to/ubuntu-24.04-desktop.iso /path/to/iso-inspection.txt
```

The helper records the ISO size and SHA256, El Torito boot metadata, top-level entries, and the contents of `/casper` when present. Use the actual listing to identify squashfs and boot-layer names; do not assume names from another Ubuntu point release or image flavor.

This is an inspection aid only. It does not authenticate the ISO, prove LiveFS Editor compatibility, modify the image, or validate boot/install behavior. Verify publisher signatures independently and run customization only in an isolated builder.
