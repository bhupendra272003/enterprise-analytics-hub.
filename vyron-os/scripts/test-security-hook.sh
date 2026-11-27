#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$ROOT/config/hooks/live/0900-vyron-security-baseline.hook.chroot"
bash -n "$HOOK"
# Regression guard: firewall must not be force-enabled inside the chroot hook.
if grep -Eq 'ufw[[:space:]]+--force[[:space:]]+enable|ufw[[:space:]]+enable' "$HOOK"; then
 echo "ERROR: firewall activation command found in chroot hook"; exit 1
fi
grep -q 'ufw default deny incoming' "$HOOK"
grep -q 'ufw default allow outgoing' "$HOOK"
# Ensure ENABLED=yes is handled when the UFW config key/file is missing.
grep -q "^    else$" "$HOOK"
grep -Fq 'ENABLED=yes' "$HOOK"
grep -Fq '>> /etc/ufw/ufw.conf' "$HOOK"
grep -Fq '> /etc/ufw/ufw.conf' "$HOOK"
if grep -Fq '\\nENABLED=yes\\n' "$HOOK"; then
 echo "ERROR: UFW config writes literal escaped newlines"; exit 1
fi
if grep -q 'ufw --force reset' "$HOOK"; then
 echo "ERROR: destructive UFW reset found in image hook"; exit 1
fi
grep -q 'APT::Periodic::Unattended-Upgrade "1"' "$HOOK"
grep -q 'PermitRootLogin no' "$HOOK"
echo "Security hook static regression checks passed."
