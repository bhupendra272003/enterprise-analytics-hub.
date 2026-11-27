#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/scripts/validate-candidate-evidence.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'ISO fixture\n' > "$tmp/candidate.iso"
hash="$(sha256sum "$tmp/candidate.iso" | awk '{print toupper($1)}')"
(cd "$tmp" && sha256sum candidate.iso > sums)
printf 'ISO inspection: PASS\nISO SHA256: %s\n' "$hash" > "$tmp/report"
printf 'Tested ISO SHA256: %s\n' "$hash" > "$tmp/vm"
for m in BIOS UEFI LIVE_SESSION INSTALLER XFCE_LIGHTDM ANALYTICS_TOOLS NETWORK; do echo "$m=PASS" >> "$tmp/vm"; done
bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm"
sed -i 's/UEFI=PASS/UEFI=FAIL/' "$tmp/vm"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: accepted failed UEFI evidence'; exit 1; fi
grep -q 'missing or failed VM evidence: UEFI' "$tmp/out"
printf 'different hash\n' > "$tmp/report"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: accepted mismatched report hash'; exit 1; fi
grep -q 'inspection report is not bound' "$tmp/out"
printf 'ISO inspection: PASS\nISO SHA256: %s\n' "$hash" > "$tmp/report"
printf 'wrong hash\n' > "$tmp/vm"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: accepted mismatched VM evidence hash'; exit 1; fi
grep -q 'VM evidence is not bound' "$tmp/out"
printf 'tampered\n' > "$tmp/candidate.iso"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: accepted checksum mismatch'; exit 1; fi
ln -s "$tmp/report" "$tmp/report-link"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report-link" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: accepted symlink input'; exit 1; fi
echo 'Candidate evidence gate tests passed.'
