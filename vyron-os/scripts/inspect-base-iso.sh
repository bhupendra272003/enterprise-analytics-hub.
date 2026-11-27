#!/usr/bin/env bash
# Read-only inspection of a user-supplied Ubuntu ISO. Does not mount or modify it.
set -euo pipefail
usage(){ echo "Usage: $0 SOURCE.iso [REPORT.txt]"; }
[[ $# -ge 1 && $# -le 2 ]] || { usage >&2; exit 2; }
ISO="$(realpath "$1")"
[[ -f "$ISO" && -r "$ISO" && -s "$ISO" ]] || { echo "ERROR: ISO must be a readable, non-empty file" >&2; exit 1; }
command -v xorriso >/dev/null 2>&1 || { echo "ERROR: xorriso is required" >&2; exit 1; }
REPORT="${2:-}"
if [[ -n "$REPORT" ]]; then
 REPORT="$(realpath -m "$REPORT")"
 [[ "$REPORT" != "$ISO" ]] || { echo "ERROR: report path must differ from source ISO" >&2; exit 1; }
 mkdir -p "$(dirname "$REPORT")"
fi
run_report(){
 local heading="$1"; shift
 echo
 echo "=== $heading ==="
 xorriso -indev "$ISO" "$@"
}
{
 echo "VyronOS base ISO inspection (read-only; not authenticity or compatibility certification)"
 echo "File: $ISO"
 echo "Size: $(stat -c '%s bytes' "$ISO")"
 echo "SHA256: $(sha256sum "$ISO" | awk '{print $1}')"
 run_report "El Torito boot metadata" -report_el_torito plain
 run_report "Top-level ISO entries" -ls /
 run_report "Casper entries (if present)" -ls /casper
 echo
 echo "Review the Casper listing to identify actual filesystem layer names before authoring LiveFS Editor actions."
 echo "This report does not verify the publisher signature, installer behavior, or bootability."
} | if [[ -n "$REPORT" ]]; then tee "$REPORT"; else cat; fi
