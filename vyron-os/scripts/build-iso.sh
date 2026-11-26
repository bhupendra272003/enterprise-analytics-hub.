#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${VYRON_BUILD_DIR:-$ROOT/build}"
if [[ "${EUID}" -eq 0 ]]; then echo "Run build as a normal user, not root; lb handles privileged steps." >&2; exit 1; fi
if ! command -v lb >/dev/null 2>&1; then echo "live-build missing. Run scripts/prepare-host.sh first." >&2; exit 1; fi
if [[ -e "$BUILD_DIR" ]]; then echo "Build directory already exists: $BUILD_DIR" >&2; echo "Remove it manually or set VYRON_BUILD_DIR to another path." >&2; exit 1; fi
mkdir -p "$BUILD_DIR/config/package-lists"
cp "$ROOT/config/packages.list" "$BUILD_DIR/config/package-lists/vyron.list"
cd "$BUILD_DIR"
lb config \
  --distribution noble \
  --architecture amd64 \
  --archive-areas "main universe multiverse restricted" \
  --binary-images iso-hybrid \
  --bootloaders "grub-efi grub-pc" \
  --debian-installer false \
  --apt-recommends true \
  --apt-indices true
echo "live-build configuration prepared in $BUILD_DIR"
echo "Review generated config and hooks before running lb build."
lb build
echo "Build complete. Inspect the generated ISO before testing in a VM."
