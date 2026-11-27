#!/usr/bin/env bash
# Strict manifest audit on Ubuntu 24.04 Noble. No packages are installed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="$ROOT/config/packages.list"
if [[ ! -r /etc/os-release ]]; then echo "ERROR: /etc/os-release unavailable" >&2; exit 2; fi
. /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_CODENAME:-}" != noble ]]; then
 echo "ERROR: this audit requires Ubuntu 24.04 Noble; found ${PRETTY_NAME:-unknown}" >&2; exit 2
fi
command -v apt-cache >/dev/null || { echo "ERROR: apt-cache unavailable" >&2; exit 2; }
missing=0; count=0
while IFS= read -r raw || [[ -n "$raw" ]]; do
 pkg="$(printf '%s' "$raw" | sed 's/[[:space:]]//g')"
 [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
 [[ "$pkg" =~ ^[a-z0-9][a-z0-9+.-]*$ ]] || { echo "INVALID: $raw"; missing=$((missing+1)); continue; }
 count=$((count+1))
 candidate="$(apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}')"
 if [[ -n "$candidate" && "$candidate" != "(none)" ]]; then
  printf 'OK %-32s %s\n' "$pkg" "$candidate"
 else
  printf 'MISSING %-32s\n' "$pkg"; missing=$((missing+1))
 fi
done < "$LIST"
echo "Audited $count manifest entries; unresolved/invalid: $missing"
(( missing == 0 )) || exit 1
echo "Noble package-cache audit passed. This is not a full build or ISO validation."
