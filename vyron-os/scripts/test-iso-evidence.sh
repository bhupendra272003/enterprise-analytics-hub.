#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'test output image\n' > "$tmp/output.iso"
printf 'test source image\n' > "$tmp/source.iso"
bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/output.iso" "$tmp/evidence" "$tmp/source.iso"
[[ -s "$tmp/evidence/candidate-evidence.txt" && -s "$tmp/evidence/output-sha256.txt" ]]
grep -q 'Output SHA256:' "$tmp/evidence/candidate-evidence.txt"
grep -q 'Source SHA256:' "$tmp/evidence/candidate-evidence.txt"
grep -q 'does not certify' "$tmp/evidence/candidate-evidence.txt"
if bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/missing.iso" "$tmp/invalid" >/dev/null 2>&1; then echo 'accepted nonexistent ISO' >&2; exit 1; fi
if bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/output.iso" "$tmp/evidence" "$tmp/source.iso" >"$tmp/overwrite.log" 2>&1; then echo 'overwrote existing evidence' >&2; exit 1; fi
grep -q 'already exists; refusing to overwrite' "$tmp/overwrite.log"
[[ -s "$tmp/evidence/candidate-evidence.txt" && -s "$tmp/evidence/output-sha256.txt" ]]
ln -s "$tmp/missing-evidence" "$tmp/evidence-link"
if bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/output.iso" "$tmp/evidence-link" >"$tmp/symlink.log" 2>&1; then echo 'accepted symlink evidence destination' >&2; exit 1; fi
[[ -L "$tmp/evidence-link" ]]
echo 'ISO evidence recorder tests passed.'
