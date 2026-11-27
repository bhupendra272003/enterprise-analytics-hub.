#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/build"; printf 'mock iso\n' > "$tmp/source.iso"
mkdir -p "$tmp/bin"
for tool in sha256sum xorriso mksquashfs livefs-edit qemu-system-x86_64; do printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/$tool"; chmod +x "$tmp/bin/$tool"; done
PATH="$tmp/bin:$PATH" VYRON_BUILD_DIR="$tmp/build" VYRON_SOURCE_ISO="$tmp/source.iso" VYRON_READINESS_REPORT="$tmp/report.txt" bash "$ROOT/scripts/release-readiness-snapshot.sh"
grep -q 'not release certification' "$tmp/report.txt"
grep -q 'This snapshot cannot prove' "$tmp/report.txt"
echo 'Release readiness snapshot regression test passed.'
