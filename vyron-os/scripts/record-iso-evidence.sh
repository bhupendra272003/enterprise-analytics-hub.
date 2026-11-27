#!/usr/bin/env bash
# Create a reproducible, informational evidence record without overwriting prior evidence.
set -euo pipefail
if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 OUTPUT_ISO EVIDENCE_DIR [SOURCE_ISO]" >&2
  exit 2
fi
OUTPUT_ISO="$1"; EVIDENCE_DIR="$2"; SOURCE_ISO="${3:-}"
[[ -f "$OUTPUT_ISO" && -r "$OUTPUT_ISO" && -s "$OUTPUT_ISO" ]] || { echo "Output ISO must be a readable, non-empty regular file." >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required." >&2; exit 1; }
command -v date >/dev/null || exit 1
OUT_PARENT="$(realpath "$(dirname "$EVIDENCE_DIR")")"
FINAL_DIR="$OUT_PARENT/$(basename "$EVIDENCE_DIR")"
[[ ! -e "$FINAL_DIR" && ! -L "$FINAL_DIR" ]] || { echo "Evidence directory already exists; refusing to overwrite: $FINAL_DIR" >&2; exit 1; }
OUT_HASH="$(sha256sum "$OUTPUT_ISO" | awk '{print $1}')"
SOURCE_HASH="not-provided"
if [[ -n "$SOURCE_ISO" ]]; then
  [[ -f "$SOURCE_ISO" && -r "$SOURCE_ISO" && -s "$SOURCE_ISO" ]] || { echo "Source ISO must be a readable, non-empty regular file." >&2; exit 1; }
  SOURCE_HASH="$(sha256sum "$SOURCE_ISO" | awk '{print $1}')"
fi
COMMIT="$(git -C "$(dirname "$0")/../.." rev-parse HEAD 2>/dev/null || echo unknown)"
HOST="$(uname -srm)"
OS_NAME="unknown"
if [[ -r /etc/os-release ]]; then OS_NAME="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | head -n1 | tr -d '"')"; fi
STAGING="$(mktemp -d "$OUT_PARENT/.$(basename "$FINAL_DIR").tmp.XXXXXXXX")"
cleanup(){
  if [[ -n "${STAGING:-}" && -d "$STAGING" ]]; then
    rm -rf -- "$STAGING"
  fi
  return 0
}
trap cleanup EXIT
{
  echo "VyronOS ISO Candidate Evidence"
  echo "Recorded UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Repository commit: $COMMIT"
  echo "Host: $HOST"
  echo "Host OS: $OS_NAME"
  echo "Output ISO: $(basename "$OUTPUT_ISO")"
  echo "Output SHA256: $OUT_HASH"
  if [[ -n "$SOURCE_ISO" ]]; then echo "Source ISO: $(basename "$SOURCE_ISO")"; echo "Source SHA256: $SOURCE_HASH"; else echo "Source ISO: not-provided"; echo "Source SHA256: $SOURCE_HASH"; fi
  echo "Status: evidence only; does not certify authenticity, bootability, installation, or release readiness."
} > "$STAGING/candidate-evidence.txt"
printf '%s  %s\n' "$OUT_HASH" "$(basename "$OUTPUT_ISO")" > "$STAGING/output-sha256.txt"
chmod 0644 "$STAGING/"*
mv -T -n -- "$STAGING" "$FINAL_DIR"
[[ ! -e "$STAGING" ]] || { echo "Evidence destination appeared during publication; refusing to overwrite" >&2; exit 1; }
STAGING=""
echo "Evidence recorded at $FINAL_DIR/candidate-evidence.txt"
