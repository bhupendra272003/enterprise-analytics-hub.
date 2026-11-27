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
grep -Fq 'trap cleanup ERR' "$helper"
grep -Fq 'removing incomplete account' "$helper"
# Password must be set before the role assignment; provisioning failure cleanup is armed.
passwd_line="$(grep -Fn 'passwd "$username"' "$helper" | cut -d: -f1)"
role_line="$(grep -Fn 'bash "$ROLE_HELPER" "$username" "$role"' "$helper" | cut -d: -f1)"
[[ -n "$passwd_line" && -n "$role_line" && "$passwd_line" -lt "$role_line" ]]
grep -Fq 'Cancelled.' "$helper"
if grep -Eq 'useradd[[:space:]].*(-p[[:space:]]|--password)|chpasswd' "$helper"; then
 echo "ERROR: unsafe password handling detected"; exit 1
fi
echo "First-user provisioning static checks passed."
