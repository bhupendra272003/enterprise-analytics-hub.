#!/usr/bin/env bash
# Resolve the manifest against the configured Ubuntu repositories without installing packages.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="$ROOT/config/packages.list"
command -v apt-get >/dev/null || { echo "ERROR: apt-get required" >&2; exit 1; }
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
echo "Package resolution simulation completed."
