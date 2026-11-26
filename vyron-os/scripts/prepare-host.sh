#!/usr/bin/env bash
# Prepare an Ubuntu 24.04 host for building Vyron OS ISO images.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/prepare-host.sh" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Cannot identify host OS (/etc/os-release missing)." >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script is intended for Ubuntu build hosts. Detected: ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi
if [[ "${VERSION_ID:-}" != "24.04" ]]; then
  echo "Warning: target is Ubuntu 24.04; detected ${VERSION_ID:-unknown}. Proceeding cautiously." >&2
fi

packages=(
  live-build debootstrap squashfs-tools xorriso
  grub-pc-bin grub-efi-amd64-bin mtools dosfstools
  rsync git curl wget ca-certificates gnupg
  apt-utils build-essential
)

echo "Updating apt package indexes..."
apt-get update
echo "Installing ISO build prerequisites..."
DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"

echo
echo "Host preparation completed."
echo "Installed tools:"
for tool in lb debootstrap mksquashfs xorriso git; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '  %-14s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '  %-14s NOT FOUND\n' "$tool"
  fi
done
echo "Next: run the Vyron OS build scaffold from its project directory."
