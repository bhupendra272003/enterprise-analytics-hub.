#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/scripts/validate-candidate-evidence.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'ISO fixture\n' > "$tmp/candidate.iso"
(cd "$tmp" && sha256sum candidate.iso > sums)
printf 'ISO inspection: PASS\n' > "$tmp/report"
for m in BIOS UEFI LIVE_SESSION INSTALLER XFCE_LIGHTDM ANALYTICS_TOOLS NETWORK; do echo "$m=PASS"; done > "$tmp/vm"
bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm"
sed -i 's/UEFI=PASS/UEFI=FAIL/' "$tmp/vm"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: gate accepted failed UEFI evidence'; exit 1; fi
grep -q 'missing or failed VM evidence: UEFI' "$tmp/out"
printf 'tampered\n' > "$tmp/candidate.iso"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: gate accepted checksum mismatch'; exit 1; fi
ln -s "$tmp/report" "$tmp/report-link"
if bash "$GATE" "$tmp/candidate.iso" "$tmp/report-link" "$tmp/sums" "$tmp/vm" >"$tmp/out" 2>&1; then echo 'ERROR: gate accepted symlink input'; exit 1; fi
echo 'Candidate evidence gate tests passed.'
