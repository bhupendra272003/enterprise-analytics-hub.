#!/usr/bin/env bash
set -euo pipefail

# Apply a conservative security baseline on an Ubuntu installation.
# Run as root; review before execution. This does not provide complete data-loss prevention.
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi
if [[ ! -r /etc/os-release ]]; then
  echo "Cannot identify operating system." >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script is intended for Ubuntu; refusing to continue." >&2
  exit 1
fi

apt-get update
apt-get install -y ufw apparmor apparmor-utils auditd audispd-plugins unattended-upgrades

# Conservative firewall: deny unsolicited inbound, allow outbound.
ufw --force default deny incoming
ufw --force default allow outgoing
# SSH is deliberately not opened automatically.
ufw --force enable

systemctl enable --now apparmor
systemctl enable --now auditd || true
systemctl enable --now unattended-upgrades || true

# Harden SSH only if the service/config exists; preserve backups and validate before reload.
if [[ -d /etc/ssh/sshd_config.d ]]; then
  cat > /etc/ssh/sshd_config.d/99-vyron-security.conf <<'SSH'
PermitRootLogin no
SSH
  if command -v sshd >/dev/null 2>&1 && sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  else
    rm -f /etc/ssh/sshd_config.d/99-vyron-security.conf
    echo "SSH config validation failed; reverted added drop-in." >&2
  fi
fi

echo "Baseline applied. Verify firewall, AppArmor, auditd, updates, and SSH locally."
ufw status verbose
aa-status || true
systemctl status auditd --no-pager || true
