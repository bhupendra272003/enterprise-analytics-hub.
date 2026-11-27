#!/usr/bin/env bash
# Authenticate and inspect a base ISO, then atomically create an evidence workspace.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage(){ echo "Usage: $0 SOURCE.iso SHA256SUMS SHA256SUMS.gpg TRUSTED_KEYRING CANDIDATE_DIR" >&2; }
[[ $# -eq 5 ]] || { usage; exit 2; }
ISO="$(realpath "$1")"; SUMS="$(realpath "$2")"; SIG="$(realpath "$3")"; KEYRING="$(realpath "$4")"
WORKSPACE_PARENT="$(realpath "$(dirname "$5")")"
WORKSPACE="$WORKSPACE_PARENT/$(basename "$5")"
for f in "$ISO" "$SUMS" "$SIG" "$KEYRING"; do
  [[ -f "$f" && -r "$f" && -s "$f" ]] || { echo "ERROR: required input missing, empty or unreadable: $f" >&2; exit 1; }
done
[[ -s "$ISO" ]] || { echo "ERROR: source ISO is empty" >&2; exit 1; }
[[ ! -e "$WORKSPACE" && ! -L "$WORKSPACE" ]] || { echo "ERROR: candidate directory already exists; refusing overwrite" >&2; exit 1; }
PARENT="$(dirname "$WORKSPACE")"
[[ -d "$PARENT" ]] || { echo "ERROR: candidate parent directory must already exist" >&2; exit 1; }
[[ "$WORKSPACE" != "$ISO" ]] || { echo "ERROR: candidate directory cannot be the source ISO path" >&2; exit 1; }
MIN_FREE_GB="${VYRON_INTAKE_MIN_FREE_GB:-100}"
if [[ ! "$MIN_FREE_GB" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: VYRON_INTAKE_MIN_FREE_GB must be a positive whole number of GiB" >&2; exit 2
fi
free_kb="$(df -Pk "$PARENT" | awk 'NR==2 {print $4}')"
[[ "$free_kb" =~ ^[0-9]+$ ]] || { echo "ERROR: unable to determine free disk space" >&2; exit 1; }
free_gb=$((free_kb / 1024 / 1024))
(( free_gb >= MIN_FREE_GB )) || { echo "ERROR: candidate storage has ${free_gb} GiB free; need ${MIN_FREE_GB} GiB" >&2; exit 1; }
echo "Authenticating the published checksum manifest and verifying the source ISO..."
bash "$ROOT/scripts/verify-source-integrity.sh" "$ISO" "$SUMS" "$SIG" "$KEYRING"
TMP_WORKSPACE=""
cleanup(){ [[ -n "$TMP_WORKSPACE" && -d "$TMP_WORKSPACE" ]] && rm -rf -- "$TMP_WORKSPACE"; }
trap cleanup EXIT
TMP_WORKSPACE="$(mktemp -d -m 0755 "$PARENT/.$(basename "$WORKSPACE").tmp.XXXXXXXX")"
bash "$ROOT/scripts/inspect-base-iso.sh" "$ISO" "$TMP_WORKSPACE/base-iso-inspection.txt"
cp "$SUMS" "$TMP_WORKSPACE/SHA256SUMS"
cp "$SIG" "$TMP_WORKSPACE/SHA256SUMS.gpg"
{
  echo "VyronOS authenticated base ISO intake"
  echo "Recorded UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Source ISO: $ISO"
  echo "Source SHA256: $(sha256sum "$ISO" | awk '{print $1}')"
  echo "Checksum manifest SHA256: $(sha256sum "$SUMS" | awk '{print $1}')"
  echo "Detached signature SHA256: $(sha256sum "$SIG" | awk '{print $1}')"
  echo "Trusted keyring: $KEYRING"
  echo "Pinned signing-key fingerprint: ${VYRON_EXPECTED_SIGNING_FINGERPRINT^^}"
  echo "Free space at intake: ${free_gb} GiB (minimum ${MIN_FREE_GB} GiB)"
  echo "Inspection is read-only; LiveFS Editor compatibility and bootability are not certified."
} > "$TMP_WORKSPACE/intake-evidence.txt"
mv -T -n -- "$TMP_WORKSPACE" "$WORKSPACE"
[[ ! -e "$TMP_WORKSPACE" ]] || { echo "ERROR: candidate path appeared during intake; refusing to publish" >&2; exit 1; }
trap - EXIT
echo "Authenticated intake evidence created: $WORKSPACE"
echo "The source ISO remains unchanged at: $ISO"
