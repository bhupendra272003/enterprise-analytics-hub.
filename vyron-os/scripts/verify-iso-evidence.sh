#!/usr/bin/env bash
# Verify that an ISO, checksum sidecar, and recorder evidence agree.
# This checks consistency only; it does not authenticate the source or prove bootability.
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 OUTPUT_ISO EVIDENCE_DIR" >&2
  exit 2
fi
ISO="$1"
EVIDENCE_DIR="$2"
[[ ! -L "$EVIDENCE_DIR" && -d "$EVIDENCE_DIR" ]] || { echo "ERROR: evidence path must be a real directory, not a symlink" >&2; exit 1; }
EVIDENCE="$EVIDENCE_DIR/candidate-evidence.txt"
CHECKSUM="$EVIDENCE_DIR/output-sha256.txt"
for file in "$EVIDENCE" "$CHECKSUM"; do
  [[ ! -L "$file" && -f "$file" && -r "$file" && -s "$file" ]] || { echo "ERROR: missing, unreadable, empty, or symlink evidence file: $file" >&2; exit 1; }
done
[[ ! -L "$ISO" && -f "$ISO" && -r "$ISO" && -s "$ISO" ]] || { echo "ERROR: output ISO must be a readable, non-empty regular file (not a symlink)" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "ERROR: sha256sum is required" >&2; exit 1; }
iso_name="$(basename "$ISO")"
recorded_name="$(sed -n 's/^Output ISO: //p' "$EVIDENCE")"
recorded_hash="$(sed -n 's/^Output SHA256: //p' "$EVIDENCE")"
[[ "$recorded_name" == "$iso_name" ]] || { echo "ERROR: evidence names '$recorded_name', but supplied ISO is '$iso_name'" >&2; exit 1; }
[[ "$recorded_hash" =~ ^[[:xdigit:]]{64}$ ]] || { echo "ERROR: evidence contains a malformed output SHA256" >&2; exit 1; }
checksum_line="$(cat "$CHECKSUM")"
[[ "$checksum_line" =~ ^([[:xdigit:]]{64})\ \ (.+)$ ]] || { echo "ERROR: checksum sidecar is malformed" >&2; exit 1; }
sidecar_hash="${BASH_REMATCH[1]}"
sidecar_name="${BASH_REMATCH[2]}"
[[ "$sidecar_name" == "$iso_name" ]] || { echo "ERROR: checksum sidecar names '$sidecar_name', not '$iso_name'" >&2; exit 1; }
[[ "$sidecar_hash" == "$recorded_hash" ]] || { echo "ERROR: checksum sidecar hash differs from evidence record" >&2; exit 1; }
actual_hash="$(sha256sum "$ISO" | awk '{print $1}')"
[[ "$actual_hash" == "$recorded_hash" ]] || { echo "ERROR: supplied ISO hash differs from recorded evidence" >&2; exit 1; }
echo "Evidence consistency verified for $iso_name (SHA256 $actual_hash)."
echo "LIMITATION: this does not authenticate the source ISO, validate a detached signature, or certify bootability/installability."
