#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$ROOT/config/hooks/live/1000-vyron-first-user-tools.hook.chroot"
bash -n "$hook"
grep -Fq 'install -d -o root -g root -m 0755 "$DEST"' "$hook"
grep -Fq 'provision-user.sh' "$hook"
grep -Fq 'assign-role.sh' "$hook"
grep -Fq 'ln -sf /usr/local/lib/vyron/scripts/provision-user.sh /usr/local/sbin/vyron-first-user' "$hook"
grep -Fq 'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../..' "$hook"
echo "First-user tools installation hook static checks passed."
