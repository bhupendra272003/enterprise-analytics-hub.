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
    echo "ERROR: accepted invalid customization disk threshold: $value" >&2; exit 1
  fi
  grep -q 'VYRON_CUSTOMIZE_MIN_FREE_GB must be a positive whole number' "$tmp/out"
done
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/source.iso" "$tmp/actions.yaml" >"$tmp/same.log" 2>&1; then
  echo 'ERROR: accepted source as destination' >&2; exit 1
fi
grep -q 'destination must differ from source' "$tmp/same.log"
printf 'existing output must survive\n' > "$tmp/existing.iso"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/existing.iso" "$tmp/actions.yaml" >"$tmp/existing.log" 2>&1; then
  echo 'ERROR: accepted existing destination' >&2; exit 1
fi
grep -q 'destination already exists; refusing overwrite' "$tmp/existing.log"
grep -q 'existing output must survive' "$tmp/existing.iso"
if bash "$SCRIPT" "$tmp/missing.iso" "$tmp/output.iso" "$tmp/actions.yaml" >"$tmp/missing-source.log" 2>&1; then
  echo 'ERROR: accepted missing source ISO' >&2; exit 1
fi
grep -q 'source ISO unreadable' "$tmp/missing-source.log"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/missing.yaml" >"$tmp/missing-actions.log" 2>&1; then
  echo 'ERROR: accepted missing action YAML' >&2; exit 1
fi
grep -q 'action YAML unreadable' "$tmp/missing-actions.log"
echo 'Customization wrapper safety regression tests passed (threshold, source/destination, overwrite and missing inputs).'
