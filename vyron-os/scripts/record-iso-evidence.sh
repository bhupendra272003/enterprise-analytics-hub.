#!/usr/bin/env bash
# Create a reproducible, informational evidence record for a VyronOS ISO candidate.
set -euo pipefail
if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 OUTPUT_ISO EVIDENCE_DIR [SOURCE_ISO]" >&2
  exit 2
fi
OUTPUT_ISO="$1"; EVIDENCE_DIR="$2"; SOURCE_ISO="${3:-}"
[[ -f "$OUTPUT_ISO" && -r "$OUTPUT_ISO" ]] || { echo "Output ISO must be a readable regular file." >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required." >&2; exit 1; }
command -v date >/dev/null || exit 1
mkdir -p "$EVIDENCE_DIR"
OUT_HASH="$(sha256sum "$OUTPUT_ISO" | awk '{print $1}')"
SOURCE_HASH="not-provided"
if [[ -n "$SOURCE_ISO" ]]; then
  [[ -f "$SOURCE_ISO" && -r "$SOURCE_ISO" ]] || { echo "Source ISO must be readable." >&2; exit 1; }
  SOURCE_HASH="$(sha256sum "$SOURCE_ISO" | awk '{print $1}')"
fi
COMMIT="$(git -C "$(dirname "$0")/../../.." rev-parse HEAD 2>/dev/null || echo unknown)"
HOST="$(uname -srm)"
OS_NAME="unknown"
if [[ -r /etc/os-release ]]; then OS_NAME="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | head -n1 | tr -d '"' )"; fi
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
} > "$EVIDENCE_DIR/candidate-evidence.txt"
printf '%s  %s\n' "$OUT_HASH" "$(basename "$OUTPUT_ISO")" > "$EVIDENCE_DIR/output-sha256.txt"
echo "Evidence recorded at $EVIDENCE_DIR/candidate-evidence.txt"
