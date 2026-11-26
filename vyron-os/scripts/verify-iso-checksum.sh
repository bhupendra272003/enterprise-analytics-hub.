#!/usr/bin/env bash
# Verify a downloaded ISO against a SHA256SUMS file (signature verification is a separate prerequisite).
set -euo pipefail
if [[ $# -ne 2 ]]; then echo "Usage: $0 ISO SHA256SUMS" >&2; exit 2; fi
ISO="$1"; SUMS="$2"
[[ -f "$ISO" && -f "$SUMS" ]] || { echo "ERROR: both files must exist" >&2; exit 1; }
name="$(basename "$ISO")"
line="$(grep -E "^[[:xdigit:]]{64}[[:space:]]+[*]?${name}$" "$SUMS" || true)"
[[ -n "$line" ]] || { echo "ERROR: checksum entry not found for $name" >&2; exit 1; }
expected="$(printf '%s' "$line" | awk '{print $1}')"
actual="$(sha256sum "$ISO" | awk '{print $1}')"
echo "Expected: $expected"
echo "Actual:   $actual"
[[ "$expected" == "$actual" ]] || { echo "ERROR: checksum mismatch" >&2; exit 1; }
echo "Checksum matches. Ensure SHA256SUMS itself was authenticated using Ubuntu's published signature before trusting it."
