#!/usr/bin/env bash
# Fail-closed gate for a candidate ISO: no readiness claim without inspection, checksum and VM evidence.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage(){ echo "Usage: $0 ISO INSPECTION_REPORT SHA256SUMS VM_EVIDENCE"; }
[[ $# -eq 4 ]] || { usage >&2; exit 2; }
for f in "$@"; do [[ ! -L "$f" ]] || { echo "ERROR: symlink input refused: $f" >&2; exit 1; }; done
ISO="$(realpath "$1")"; REPORT="$(realpath "$2")"; SUMS="$(realpath "$3")"; VM="$(realpath "$4")"
[[ -s "$ISO" && -s "$REPORT" && -s "$SUMS" && -s "$VM" ]] || { echo "ERROR: all gate inputs must be nonempty files" >&2; exit 1; }
bash "$ROOT/scripts/verify-iso-checksum.sh" "$ISO" "$SUMS"
# Explicit required evidence markers, one per test; values must be PASS.
for marker in BIOS UEFI LIVE_SESSION INSTALLER XFCE_LIGHTDM ANALYTICS_TOOLS NETWORK; do
 grep -qx "$marker=PASS" "$VM" || { echo "ERROR: missing or failed VM evidence: $marker" >&2; exit 1; }
done
grep -q 'ISO inspection: PASS' "$REPORT" || { echo "ERROR: inspection report lacks PASS marker" >&2; exit 1; }
echo "Candidate evidence gate passed. This validates supplied records, not their truth; independent review and real VM testing remain required."
