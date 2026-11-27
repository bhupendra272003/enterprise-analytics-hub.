#!/usr/bin/env bash
set -euo pipefail
set -x
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'test output image\\n' > "$tmp/output.iso"
printf 'test source image\\n' > "$tmp/source.iso"
bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/output.iso" "$tmp/evidence" "$tmp/source.iso"
for file in "$tmp/evidence/candidate-evidence.txt" "$tmp/evidence/output-sha256.txt"; do
  [[ -s "$file" ]] || { echo "ERROR: missing or empty evidence artifact: $file" >&2; exit 1; }
done
grep -q 'Output SHA256:' "$tmp/evidence/candidate-evidence.txt" || { echo "ERROR: output hash absent from evidence record" >&2; exit 1; }
grep -q 'Source SHA256:' "$tmp/evidence/candidate-evidence.txt" || { echo "ERROR: source hash absent from evidence record" >&2; exit 1; }
grep -q 'does not certify' "$tmp/evidence/candidate-evidence.txt" || { echo "ERROR: evidence limitation disclaimer absent" >&2; exit 1; }
if bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/missing.iso" "$tmp/invalid" >/dev/null 2>&1; then echo 'ERROR: accepted nonexistent ISO' >&2; exit 1; fi
if bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/output.iso" "$tmp/evidence" "$tmp/source.iso" >"$tmp/overwrite.log" 2>&1; then echo 'ERROR: overwrote existing evidence' >&2; exit 1; fi
grep -q 'already exists; refusing to overwrite' "$tmp/overwrite.log" || { cat "$tmp/overwrite.log" >&2; echo 'ERROR: overwrite guard did not explain refusal' >&2; exit 1; }
[[ -s "$tmp/evidence/candidate-evidence.txt" && -s "$tmp/evidence/output-sha256.txt" ]] || { echo 'ERROR: existing evidence changed after overwrite attempt' >&2; exit 1; }
ln -s "$tmp/missing-evidence" "$tmp/evidence-link"
if bash "$ROOT/scripts/record-iso-evidence.sh" "$tmp/output.iso" "$tmp/evidence-link" >"$tmp/symlink.log" 2>&1; then echo 'ERROR: accepted symlink evidence destination' >&2; exit 1; fi
[[ -L "$tmp/evidence-link" ]] || { echo 'ERROR: symlink destination was altered' >&2; exit 1; }
echo 'ISO evidence recorder tests passed.'
