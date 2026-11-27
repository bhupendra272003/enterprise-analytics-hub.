#!/usr/bin/env bash
set -uo pipefail
echo "=== VyronOS security posture check (read-only) ==="
warn=0
pass(){ printf '[PASS] %s\n' "$1"; }
warnf(){ printf '[WARN] %s\n' "$1"; warn=$((warn+1)); }
if command -v ufw >/dev/null; then
 status="$(ufw status 2>&1)"
 if grep -q 'Status: active' <<<"$status"; then pass "UFW active"; else warnf "UFW inactive"; fi
 if grep -qi 'Default: deny (incoming)' <<<"$status"; then pass "UFW incoming default deny"; else warnf "UFW default incoming deny not confirmed"; fi
else warnf "UFW missing"; fi
for svc in apparmor auditd unattended-upgrades; do
 if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$svc"; then pass "$svc active"; else warnf "$svc inactive"; fi
 else warnf "systemctl unavailable; cannot verify $svc"; fi
done
if command -v sshd >/dev/null 2>&1; then
 effective="$(sshd -T 2>/dev/null || true)"
 if grep -Eq '^permitrootlogin no$' <<<"$effective"; then pass "effective SSH root login disabled"; else warnf "effective SSH root-login policy not confirmed"; fi
else echo "[INFO] sshd not installed; skipping SSH server policy"; fi
if command -v aa-status >/dev/null 2>&1; then
 aa-status --enabled >/dev/null 2>&1 && pass "AppArmor enabled" || warnf "AppArmor enabled state not confirmed"
else warnf "AppArmor status tool unavailable"; fi
echo "Warnings: $warn"
echo "Read-only checks only; not a security audit or certification."
