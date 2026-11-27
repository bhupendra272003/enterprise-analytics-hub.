#!/usr/bin/env bash
# Authenticate Ubuntu's checksum manifest with an explicitly pinned signing-key fingerprint.
set -euo pipefail
if [[ $# -ne 4 ]]; then
 echo "Usage: VYRON_EXPECTED_SIGNING_FINGERPRINT=HEX $0 ISO SHA256SUMS SHA256SUMS.gpg TRUSTED_KEYRING" >&2
 exit 2
fi
ISO="$1"; SUMS="$2"; SIG="$3"; KEYRING="$4"
for f in "$ISO" "$SUMS" "$SIG" "$KEYRING"; do
 [[ ! -L "$f" && -r "$f" && -f "$f" && -s "$f" ]] || { echo "ERROR: required input must be a readable, non-empty regular file (not symlink): $f" >&2; exit 1; }
done
command -v gpgv >/dev/null || { echo "ERROR: gpgv is required" >&2; exit 1; }
EXPECTED="${VYRON_EXPECTED_SIGNING_FINGERPRINT:-}"
if [[ ! "$EXPECTED" =~ ^([[:xdigit:]]{40}|[[:xdigit:]]{64})$ ]]; then
 echo "ERROR: set VYRON_EXPECTED_SIGNING_FINGERPRINT to an independently verified 40- or 64-hex signing-key fingerprint" >&2
 exit 2
fi
EXPECTED="${EXPECTED^^}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
status_file="$(mktemp)"
trap 'rm -f "$status_file"' EXIT
echo "Authenticating checksum manifest with the supplied keyring and pinned fingerprint..."
if ! gpgv --status-fd=1 --keyring "$KEYRING" "$SIG" "$SUMS" >"$status_file"; then
 echo "ERROR: checksum manifest signature verification failed" >&2
 exit 1
fi
mapfile -t valid_fingerprints < <(awk '$1=="[GNUPG:]" && $2=="VALIDSIG" {print toupper($3); if ($NF ~ /^([[:xdigit:]]{40}|[[:xdigit:]]{64})$/) print toupper($NF)}' "$status_file")
if (( ${#valid_fingerprints[@]} < 1 )); then
 echo "ERROR: signature verification produced no VALIDSIG status" >&2
 exit 1
fi
matches=0
for fingerprint in "${valid_fingerprints[@]}"; do
 [[ "$fingerprint" == "$EXPECTED" ]] && matches=1
done
if (( matches == 0 )); then
 echo "ERROR: signature is valid but signing-key fingerprint does not match the independently pinned fingerprint" >&2
 exit 1
fi
echo "Signing-key fingerprint matches the independently supplied pin. Verifying ISO checksum..."
bash "$ROOT/verify-iso-checksum.sh" "$ISO" "$SUMS"
