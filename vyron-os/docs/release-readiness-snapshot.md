# Read-only release readiness snapshot

This helper performs a local, read-only snapshot of common prerequisites before attempting image customization. It checks tool presence, optional source ISO readability and storage headroom. It does not verify ISO authenticity, Ubuntu desktop ISO compatibility, package dependencies or boot/install behavior.

```bash
VYRON_BUILD_DIR=/path/to/build VYRON_SOURCE_ISO=/path/to/ubuntu.iso bash vyron-os/scripts/release-readiness-snapshot.sh
```

It exits nonzero if a checked prerequisite is missing. In CI regression tests, tool checks are shimmed and must not be interpreted as an actual host check. A passing snapshot is not release certification.
