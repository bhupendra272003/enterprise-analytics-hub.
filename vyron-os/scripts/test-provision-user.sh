#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$ROOT/scripts/provision-user.sh"
bash -n "$helper"
# Static guardrails ensure the interactive helper requires root, validates inputs,
# avoids overwriting existing accounts and sets password interactively.
grep -Fq 'EUID' "$helper"
grep -Fq 'getent passwd "$username"' "$helper"
grep -Fq 'passwd "$username"' "$helper"
grep -Fq 'assign-role.sh' "$helper"
grep -Fq 'userdel' "$helper"
grep -Fq 'Cancelled.' "$helper"
if grep -Eq 'useradd .*--password|chpasswd|echo .*password' "$helper"; then
 echo "ERROR: unsafe password handling detected"; exit 1
fi
echo "First-user provisioning static checks passed."
