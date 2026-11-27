#!/usr/bin/env bash
# Regression tests for security.conf parser; isolated temporary policy files.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
validator="$ROOT/scripts/validate-security-config.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$ROOT/config/security.conf" "$tmp/security.conf"
# Use a test copy of validator pointing at temporary configuration.
sed "s|file=.*|file=\"$tmp/security.conf\"|" "$validator" > "$tmp/validator.sh"
bash "$tmp/validator.sh"
# Duplicate-key policy must be rejected.
printf '\nVYRON_FIREWALL="ufw"\n' >> "$tmp/security.conf"
if bash "$tmp/validator.sh" >/dev/null 2>&1; then echo "ERROR: duplicate policy key accepted"; exit 1; fi
# Unknown value and malformed line must be rejected.
cp "$ROOT/config/security.conf" "$tmp/security.conf"
sed -i 's/VYRON_FIREWALL_DEFAULT_INCOMING="deny"/VYRON_FIREWALL_DEFAULT_INCOMING="allow"/' "$tmp/security.conf"
if bash "$tmp/validator.sh" >/dev/null 2>&1; then echo "ERROR: unsafe incoming policy accepted"; exit 1; fi
cp "$ROOT/config/security.conf" "$tmp/security.conf"
printf '\nmalformed policy\n' >> "$tmp/security.conf"
if bash "$tmp/validator.sh" >/dev/null 2>&1; then echo "ERROR: malformed policy accepted"; exit 1; fi
echo "Security policy validator regression tests passed."
