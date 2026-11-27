#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/customize-base-iso.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf 'fixture ISO\n' > "$tmp/source.iso"
printf 'actions: []\n' > "$tmp/actions.yaml"
for value in abc 0 -5 1.5; do
  if VYRON_CUSTOMIZE_MIN_FREE_GB="$value" bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/actions.yaml" >"$tmp/out" 2>&1; then
    echo "ERROR: accepted invalid customization disk threshold: $value" >&2
    exit 1
  fi
  grep -q 'VYRON_CUSTOMIZE_MIN_FREE_GB must be a positive whole number' "$tmp/out"
done
echo 'Customization wrapper threshold validation tests passed.'
