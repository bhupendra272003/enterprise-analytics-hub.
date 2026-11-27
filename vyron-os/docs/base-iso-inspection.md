# Read-only base ISO inspection

Before writing a LiveFS Editor action file, inspect the exact ISO supplied to the isolated builder:

```bash
bash vyron-os/scripts/inspect-base-iso.sh /path/to/ubuntu-24.04-desktop.iso /path/to/iso-inspection.txt
```

The helper records the ISO size and SHA256, El Torito boot metadata, top-level entries, and the contents of `/casper` when present. Use the actual listing to identify squashfs and boot-layer names; do not assume names from another Ubuntu point release or image flavor.

This is an inspection aid only. It does not authenticate the ISO, prove LiveFS Editor compatibility, modify the image, or validate boot/install behavior. Verify publisher signatures independently and run customization only in an isolated builder.

## Authenticated intake workspace

After downloading the official ISO, checksum manifest, detached signature, and preparing a trusted Ubuntu keyring, independently verify the official signing-key fingerprint from Ubuntu documentation through a trusted channel. Set the pin explicitly; a keyring file alone is not sufficient trust configuration. Then create an evidence workspace:

```bash
bash vyron-os/scripts/intake-base-iso.sh \\
  /path/to/ubuntu-24.04-desktop.iso \\
  /path/to/SHA256SUMS \\
  /path/to/SHA256SUMS.gpg \\
  /path/to/ubuntu-trusted-keyring.gpg \\
  /path/outside/repository/vyronos-base-candidate
```

The intake helper authenticates the checksum manifest with the supplied keyring and explicitly pinned signing-key fingerprint, verifies the ISO checksum, checks available disk space (100 GiB by default), and performs read-only ISO inspection. The fingerprint must be obtained independently; do not copy an unverified value from an example or from the keyring itself. It creates the candidate directory only after integrity verification succeeds, stores the inspection and checksum evidence, and refuses to overwrite an existing candidate. It does not download the ISO, establish trust in the supplied keyring, validate LiveFS Editor compatibility, or certify bootability. The original ISO remains at its source path.
