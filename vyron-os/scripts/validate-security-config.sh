#!/usr/bin/env bash
# Validate security.conf as data (never source/evaluate it).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
file="$ROOT/config/security.conf"
[[ -r "$file" ]] || { echo "Missing security policy file" >&2; exit 1; }
declare -A values
while IFS= read -r line || [[ -n "$line" ]]; do
 line="${line%%#*}"
 [[ "$line" =~ ^[[:space:]]*$ ]] && continue
 if [[ "$line" =~ ^[[:space:]]*([A-Z][A-Z0-9_]*)[[:space:]]*=[[:space:]]*"(true|false|deny|allow|ufw)"[[:space:]]*$ ]]; then
  key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
  [[ -z "${values[$key]+x}" ]] || { echo "Duplicate key: $key" >&2; exit 1; }
  values["$key"]="$val"
 else echo "Invalid policy line: $line" >&2; exit 1
 fi
done < "$file"
required=(VYRON_FIREWALL VYRON_FIREWALL_DEFAULT_INCOMING VYRON_FIREWALL_DEFAULT_OUTGOING VYRON_FIREWALL_ALLOW_SSH VYRON_ENABLE_APPARMOR VYRON_ENABLE_AUDITD VYRON_DISABLE_ROOT_SSH VYRON_REQUIRE_USER_PASSWORD VYRON_AUTOMATIC_SECURITY_UPDATES VYRON_ANALYST_USB_STORAGE_BLOCK VYRON_RECOMMEND_FULL_DISK_ENCRYPTION)
for key in "${required[@]}"; do [[ -n "${values[$key]+x}" ]] || { echo "Missing key: $key" >&2; exit 1; }; done
[[ "${values[VYRON_FIREWALL]}" == ufw ]] || { echo "Unsupported firewall" >&2; exit 1; }
[[ "${values[VYRON_FIREWALL_DEFAULT_INCOMING]}" == deny ]] || { echo "Incoming policy must remain deny" >&2; exit 1; }
[[ "${values[VYRON_FIREWALL_DEFAULT_OUTGOING]}" == allow ]] || { echo "Outgoing policy must remain allow" >&2; exit 1; }
echo "Security policy configuration valid (policy intent only; not enforcement proof)."
