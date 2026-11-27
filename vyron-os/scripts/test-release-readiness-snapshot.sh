#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/build" "$tmp/bin"
printf 'mock iso\n' > "$tmp/source.iso"
for tool in sha256sum xorriso mksquashfs livefs-edit qemu-system-x86_64; do
 printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/$tool"; chmod +x "$tmp/bin/$tool"
done
# Keep this regression test deterministic: CI runner disk capacity is unrelated
# to the helper's default 100 GiB requirement for a real image-building host.
cat > "$tmp/bin/df" <<'DF'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf '/dev/mock 200000000 1000000 %s 1%% /mock\n' "${VYRON_TEST_DF_AVAILABLE:-125829120}"
DF
chmod +x "$tmp/bin/df"
export PATH="$tmp/bin:$PATH"
VYRON_BUILD_DIR="$tmp/build" VYRON_SOURCE_ISO="$tmp/source.iso" VYRON_READINESS_REPORT="$tmp/report.txt" \
 bash "$ROOT/scripts/release-readiness-snapshot.sh"
grep -q 'not release certification' "$tmp/report.txt"
grep -q 'This snapshot cannot prove' "$tmp/report.txt"
# A constrained host must still be blocked by the 100 GiB build-space gate.
if VYRON_TEST_DF_AVAILABLE=92274688 VYRON_BUILD_DIR="$tmp/build" VYRON_SOURCE_ISO="$tmp/source.iso" \
 VYRON_READINESS_REPORT="$tmp/blocked-report.txt" bash "$ROOT/scripts/release-readiness-snapshot.sh"; then
 echo 'ERROR: readiness snapshot accepted less than 100 GiB free'; exit 1
fi
grep -q 'BLOCKED: storage 88 GiB free; target >=100 GiB' "$tmp/blocked-report.txt"
# A report symlink must be rejected without modifying its target.
printf 'keep intact\\n' > "$tmp/target.txt"
ln -s "$tmp/target.txt" "$tmp/symlink-report"
if VYRON_BUILD_DIR="$tmp/build" VYRON_SOURCE_ISO="$tmp/source.iso" VYRON_READINESS_REPORT="$tmp/symlink-report" bash "$ROOT/scripts/release-readiness-snapshot.sh" >/dev/null 2>&1; then
 echo 'ERROR: report symlink was accepted'; exit 1
fi
grep -q 'keep intact' "$tmp/target.txt"
echo 'Release readiness snapshot regression tests passed.'
