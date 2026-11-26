#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="$ROOT/config/packages.list"
HOOKS="$ROOT/config/hooks/live"
fail=0
[[ -s "$LIST" ]] || { echo "FAIL: package list missing/empty"; exit 1; }
[[ -d "$HOOKS" ]] || { echo "FAIL: hooks directory missing"; exit 1; }
[[ -s "$ROOT/desktop/branding/lion-mark.svg" ]] || { echo "FAIL: lion emblem missing"; exit 1; }
[[ -s "$ROOT/desktop/branding/wallpaper.svg" ]] || { echo "FAIL: wallpaper missing"; exit 1; }
if grep -Eq '^(#.*|[[:space:]]*)$' "$LIST"; then :; fi
echo "Checking package names against apt cache (host cache may be incomplete)..."
if command -v apt-cache >/dev/null 2>&1; then
  while IFS= read -r pkg; do
    [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
    if ! apt-cache show "$pkg" >/dev/null 2>&1; then echo "WARN: package not found in current apt cache: $pkg"; fail=1; fi
  done < "$LIST"
else echo "WARN: apt-cache not available; skipping package validation"; fi
for h in "$HOOKS"/*.hook.chroot; do
  [[ -e "$h" ]] || { echo "FAIL: no chroot hooks found"; exit 1; }
  if ! grep -q '^#!/' "$h"; then echo "WARN: hook lacks shebang: $h"; fail=1; fi
done
echo "Preflight completed. Warnings indicate items to review; host apt cache is not proof of Ubuntu 24.04 ISO compatibility."
exit "$fail"
