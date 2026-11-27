#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "== VyronOS configuration validation =="
bash "$ROOT/scripts/preflight.sh"
bash "$ROOT/scripts/validate-security-config.sh"
echo
echo "Checking build host tools (informational; ISO builder installs these separately):"
for tool in lb xorriso debootstrap mksquashfs grub-mkrescue; do
 if command -v "$tool" >/dev/null 2>&1; then printf 'OK: %s\n' "$tool"; else printf 'MISSING: %s\n' "$tool"; fi
done
echo
if command -v shellcheck >/dev/null 2>&1; then
 echo "ShellCheck available; checking scripts and hooks."
 shopt -s nullglob
 candidates=("$ROOT"/scripts/*.sh "$ROOT"/config/hooks/live/*.hook.chroot)
 shellcheck -x "${candidates[@]}" || echo "ShellCheck reported issues above."
else
 echo "ShellCheck not installed; optional static lint skipped."
fi
echo "Validation summary complete. This does not prove an ISO build or boot."
