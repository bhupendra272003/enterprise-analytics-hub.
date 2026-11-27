#!/usr/bin/env bash
# Resolve the manifest against Ubuntu Noble repositories without installing packages.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="$ROOT/config/packages.list"
command -v apt-get >/dev/null || { echo "ERROR: apt-get required" >&2; exit 1; }
# Avoid presenting an arbitrary host's package cache as Noble compatibility evidence.
if [[ -r /etc/os-release ]]; then
 . /etc/os-release
 if [[ "${ID:-}" != ubuntu || "${VERSION_CODENAME:-}" != noble ]]; then
  if [[ "${VYRON_ALLOW_NON_NOBLE:-0}" != 1 ]]; then
   echo "ERROR: package resolution requires Ubuntu 24.04 Noble. Current: ${PRETTY_NAME:-unknown}. Set VYRON_ALLOW_NON_NOBLE=1 only for an explicitly non-authoritative simulation." >&2
   exit 2
  fi
  echo "WARNING: non-Noble package simulation; results are not compatibility proof."
 fi
else
 echo "WARNING: OS identity unavailable; package simulation is non-authoritative."
fi
packages=()
while IFS= read -r line || [[ -n "$line" ]]; do
 pkg="$(printf '%s' "$line" | sed 's/[[:space:]]//g')"
 [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
 [[ "$pkg" =~ ^[a-z0-9][a-z0-9+.-]*$ ]] || { echo "ERROR: invalid package token: $pkg" >&2; exit 1; }
 packages+=("$pkg")
done < "$LIST"
(( ${#packages[@]} > 0 )) || { echo "ERROR: empty package list" >&2; exit 1; }
echo "Simulating package installation (no package installation will occur)..."
apt-get install --simulate --no-install-recommends "${packages[@]}"
echo "Package resolution simulation completed. This does not install packages or validate an ISO."
