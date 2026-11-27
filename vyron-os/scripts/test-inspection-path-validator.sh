#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
REPORT="$tmp/report"
cat > "$REPORT" <<'EOF'
=== Top-level ISO entries ===
casper
EFI
=== Casper entries (if present) ===
filesystem.squashfs
vmlinuz
initrd
EOF
bash "$ROOT/scripts/validate-inspection-paths.sh" "$REPORT" /casper/filesystem.squashfs
# report strings only; paths that are absent must be rejected
if bash "$ROOT/scripts/validate-inspection-paths.sh" "$REPORT" /casper/other.squashfs >"$tmp/out" 2>&1; then echo 'ERROR: absent path accepted'; exit 1; fi
grep -q 'required ISO path not found' "$tmp/out"
if bash "$ROOT/scripts/validate-inspection-paths.sh" "$REPORT" relative/path >/dev/null 2>&1; then echo 'ERROR: relative path accepted'; exit 1; fi
ln -s "$REPORT" "$tmp/report-link"
if bash "$ROOT/scripts/validate-inspection-paths.sh" "$tmp/report-link" /casper/filesystem.squashfs >/dev/null 2>&1; then echo 'ERROR: symlink report accepted'; exit 1; fi
echo 'Inspection path validator regression tests passed.'
