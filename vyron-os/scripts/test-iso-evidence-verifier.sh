#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERIFY="$ROOT/scripts/verify-iso-evidence.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'fixture output ISO\n' > "$tmp/output.iso"
mkdir "$tmp/evidence"
hash="$(sha256sum "$tmp/output.iso" | awk '{print $1}')"
cat > "$tmp/evidence/candidate-evidence.txt" <<EOF
Output ISO: output.iso
Output SHA256: $hash
Status: evidence only; does not certify authenticity or bootability.
EOF
printf '%s  output.iso\n' "$hash" > "$tmp/evidence/output-sha256.txt"
bash "$VERIFY" "$tmp/output.iso" "$tmp/evidence" > "$tmp/positive.log"
grep -q 'Evidence consistency verified' "$tmp/positive.log"
grep -q 'does not authenticate' "$tmp/positive.log"
reject() {
  if bash "$VERIFY" "$1" "$2" >"$tmp/reject.log" 2>&1; then
    echo "ERROR: verifier accepted invalid evidence" >&2; exit 1
  fi
}
# Modified ISO, wrong basename, malformed sidecar, and disagreement between record and sidecar.
printf 'tampered ISO\n' > "$tmp/tampered.iso"
reject "$tmp/tampered.iso" "$tmp/evidence"
cp "$tmp/output.iso" "$tmp/renamed.iso"
reject "$tmp/renamed.iso" "$tmp/evidence"
printf 'not-a-checksum\n' > "$tmp/evidence/output-sha256.txt"
reject "$tmp/output.iso" "$tmp/evidence"
printf '%064d  output.iso\n' 0 > "$tmp/evidence/output-sha256.txt"
reject "$tmp/output.iso" "$tmp/evidence"
# Missing evidence and symlinked directory/files/ISO are rejected.
reject "$tmp/output.iso" "$tmp/missing"
ln -s "$tmp/evidence" "$tmp/evidence-link"
reject "$tmp/output.iso" "$tmp/evidence-link"
printf '%s  output.iso\n' "$hash" > "$tmp/evidence/output-sha256.txt"
mv "$tmp/evidence/output-sha256.txt" "$tmp/evidence/checksum-real.txt"
ln -s "$tmp/evidence/checksum-real.txt" "$tmp/evidence/output-sha256.txt"
reject "$tmp/output.iso" "$tmp/evidence"
mv "$tmp/evidence/output-sha256.txt" "$tmp/evidence/checksum-link"
mv "$tmp/evidence/checksum-real.txt" "$tmp/evidence/output-sha256.txt"
ln -s "$tmp/output.iso" "$tmp/output-link.iso"
reject "$tmp/output-link.iso" "$tmp/evidence"
echo 'ISO evidence verifier tests passed.'
