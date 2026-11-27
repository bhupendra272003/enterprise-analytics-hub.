#!/usr/bin/env bash
# Consistency gate for candidate ISO records. Evidence content must be reviewed independently.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage(){ echo "Usage: $0 ISO INSPECTION_REPORT SHA256SUMS VM_EVIDENCE"; }
[[ $# -eq 4 ]] || { usage >&2; exit 2; }
for f in "$@"; do [[ ! -L "$f" ]] || { echo "ERROR: symlink input refused: $f" >&2; exit 1; }; done
ISO="$(realpath "$1")"; REPORT="$(realpath "$2")"; SUMS="$(realpath "$3")"; VM="$(realpath "$4")"
[[ -s "$ISO" && -s "$REPORT" && -s "$SUMS" && -s "$VM" ]] || { echo "ERROR: all gate inputs must be nonempty files" >&2; exit 1; }
bash "$ROOT/scripts/verify-iso-checksum.sh" "$ISO" "$SUMS"
actual="$(sha256sum "$ISO" | awk '{print toupper($1)}')"
report_hash="$(sed -n 's/^ISO SHA256: //p' "$REPORT" | head -n 1 | tr '[:lower:]' '[:upper:]')"
vm_hash="$(sed -n 's/^Tested ISO SHA256: //p' "$VM" | head -n 1 | tr '[:lower:]' '[:upper:]')"
[[ "$report_hash" == "$actual" ]] || { echo "ERROR: inspection report is not bound to this ISO hash" >&2; exit 1; }
[[ "$vm_hash" == "$actual" ]] || { echo "ERROR: VM evidence is not bound to this ISO hash" >&2; exit 1; }
for marker in BIOS UEFI LIVE_SESSION INSTALLER XFCE_LIGHTDM ANALYTICS_TOOLS NETWORK; do
 grep -qx "$marker=PASS" "$VM" || { echo "ERROR: missing or failed VM evidence: $marker" >&2; exit 1; }
done
grep -qx 'ISO inspection: PASS' "$REPORT" || { echo "ERROR: inspection report lacks exact PASS marker" >&2; exit 1; }
echo "Candidate evidence consistency gate passed for SHA256 $actual."
echo "This checks record consistency only; it cannot verify that claimed inspection or VM tests actually occurred."
