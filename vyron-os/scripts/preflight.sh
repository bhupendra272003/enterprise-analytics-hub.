#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="$ROOT/config/packages.list"
HOOKS="$ROOT/config/hooks/live"
errors=0
[[ -s "$LIST" ]] || { echo "ERROR: package list missing or empty"; exit 1; }
[[ -d "$HOOKS" ]] || { echo "ERROR: hooks directory missing"; exit 1; }
for asset in lion-mark.svg wallpaper.svg; do
 [[ -s "$ROOT/desktop/branding/$asset" ]] || { echo "ERROR: missing asset $asset"; errors=$((errors+1)); }
done
# Normalize manifest whitespace and validate package-name syntax.
normalized="$(sed 's/[[:space:]]//g' "$LIST" | grep -vE '^(#|$)' || true)"
dupes="$(printf '%s\n' "$normalized" | sort | uniq -d || true)"
if [[ -n "$dupes" ]]; then echo "ERROR: duplicate packages: $dupes"; errors=$((errors+1)); fi
while IFS= read -r pkg; do
 [[ -z "$pkg" ]] && continue
 if [[ ! "$pkg" =~ ^[a-z0-9][a-z0-9+.-]*$ ]]; then echo "ERROR: invalid package token: $pkg"; errors=$((errors+1)); fi
done <<< "$normalized"
# Require hook scripts to be shell files with shebangs and reject missing glob matches.
shopt -s nullglob
hooks=("$HOOKS"/*.hook.chroot)
(( ${#hooks[@]} > 0 )) || { echo "ERROR: no chroot hooks found"; exit 1; }
for h in "${hooks[@]}"; do
 [[ -s "$h" ]] || { echo "ERROR: empty hook: $h"; errors=$((errors+1)); continue; }
 if ! grep -q '^#!/' "$h"; then echo "ERROR: hook lacks shebang: $h"; errors=$((errors+1)); fi
 if ! bash -n "$h" 2>/dev/null; then echo "ERROR: hook syntax check failed: $h"; errors=$((errors+1)); fi
done
if command -v apt-cache >/dev/null 2>&1; then
 echo "Package cache validation (best-effort, depends on host repositories):"
 while IFS= read -r pkg; do
  [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
  if ! apt-cache show "$pkg" >/dev/null 2>&1; then echo "WARN: unavailable in host cache: $pkg"; fi
 done < "$LIST"
else echo "WARN: apt-cache unavailable; skipping package check"; fi
if (( errors > 0 )); then echo "Preflight FAILED: $errors structural errors."; exit 1; fi
echo "Preflight PASSED structural checks. Package cache checks are advisory, not Noble build proof."
