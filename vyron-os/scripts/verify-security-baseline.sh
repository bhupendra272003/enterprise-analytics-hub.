#!/usr/bin/env bash
set -u

echo "=== Bhupendra VyronOS security verification ==="
checks=0
failures=0
check_service() {
  local name="$1"
  checks=$((checks+1))
  if systemctl is-active --quiet "$name"; then
    printf '[PASS] %s active\n' "$name"
  else
    printf '[WARN] %s is not active\n' "$name"
    failures=$((failures+1))
  fi
}
if command -v ufw >/dev/null 2>&1; then
  checks=$((checks+1))
  if ufw status | grep -q 'Status: active'; then printf '[PASS] UFW active\n'; else printf '[WARN] UFW inactive\n'; failures=$((failures+1)); fi
else
  echo '[WARN] UFW is not installed'; failures=$((failures+1))
fi
check_service apparmor
check_service auditd
check_service unattended-upgrades
checks=$((checks+1))
if [[ -r /etc/ssh/sshd_config.d/99-vyron-security.conf ]] && grep -Eq '^PermitRootLogin[[:space:]]+no$' /etc/ssh/sshd_config.d/99-vyron-security.conf; then
  echo '[PASS] Vyron SSH root-login drop-in exists'
else
  echo '[WARN] SSH root-login drop-in not detected (SSH may not be installed)'
  failures=$((failures+1))
fi
echo "Checks: $checks | warnings: $failures"
echo "Review each warning. This is a simple verification script, not a security certification."
