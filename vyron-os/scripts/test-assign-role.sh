#!/usr/bin/env bash
# Safe tests for assign-role.sh dry-run and input validation; no system account changes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$ROOT/scripts/assign-role.sh"
for role in owner manager leader analyst; do
 output="$(bash "$helper" --dry-run test-user "$role")"
 grep -q "role '$role'" <<<"$output"
done
if bash "$helper" --dry-run test-user invalid >/dev/null 2>&1; then
 echo "ERROR: invalid role accepted"; exit 1
fi
if bash "$helper" --dry-run "bad user" analyst >/dev/null 2>&1; then
 echo "ERROR: invalid username accepted"; exit 1
fi
echo "Role assignment dry-run and input validation tests passed."
