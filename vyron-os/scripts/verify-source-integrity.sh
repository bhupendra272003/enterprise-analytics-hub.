#!/usr/bin/env bash
# Authenticate Ubuntu's published checksum file and then verify the source ISO.
set -euo pipefail
if [[ $# -ne 4 ]]; then
 echo "Usage: $0 ISO SHA256SUMS SHA256SUMS.gpg TRUSTED_KEYRING" >&2
 exit 2
fi
ISO="$1"; SUMS="$2"; SIG="$3"; KEYRING="$4"
for f in "$ISO" "$SUMS" "$SIG" "$KEYRING"; do
 [[ -r "$f" && -f "$f" ]] || { echo "ERROR: required readable file missing: $f" >&2; exit 1; }
done
command -v gpgv >/dev/null || { echo "ERROR: gpgv is required" >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Authenticating checksum manifest using the supplied trusted keyring..."
gpgv --keyring "$KEYRING" "$SIG" "$SUMS"
echo "Signature authenticated. Verifying ISO checksum..."
bash "$ROOT/verify-iso-checksum.sh" "$ISO" "$SUMS"
