#!/usr/bin/env bash
# Validate that a static inspection report documents paths before action YAML references them.
set -euo pipefail
usage(){ echo "Usage: $0 INSPECTION_REPORT REQUIRED_ISO_PATH [REQUIRED_ISO_PATH ...]"; }
[[ $# -ge 2 ]] || { usage >&2; exit 2; }
REPORT="$1"; shift
[[ ! -L "$REPORT" && -f "$REPORT" && -s "$REPORT" ]] || { echo "ERROR: report must be a nonempty regular file (symlinks refused)" >&2; exit 1; }
grep -q '^=== Top-level ISO entries ===$' "$REPORT" || { echo "ERROR: report lacks top-level listing" >&2; exit 1; }
grep -q '^=== Casper entries (if present) ===$' "$REPORT" || { echo "ERROR: report lacks Casper listing" >&2; exit 1; }
for path in "$@"; do
 [[ "$path" == /* && "$path" != *'..'* ]] || { echo "ERROR: required ISO path must be absolute and traversal-free: $path" >&2; exit 2; }
 # Match listing tokens, not merely report commentary.
 basename="$(basename "$path")"
 if ! grep -Fxq "$basename" "$REPORT" && ! grep -Fq "$path" "$REPORT"; then echo "ERROR: required ISO path not found in inspection report: $path" >&2; exit 1; fi
done
echo "Inspection report documents all requested paths. This is a text-presence check, not ISO compatibility proof."
