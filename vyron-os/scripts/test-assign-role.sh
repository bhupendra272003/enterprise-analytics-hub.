#!/usr/bin/env bash
# Isolated behavior tests for assign-role.sh using command mocks; never modifies host accounts.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$ROOT/scripts/assign-role.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/id" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == "-nG" ]]; then
 printf '%s\n' "${MOCK_GROUPS:-mockuser}"
 exit 0
fi
exit 1
MOCK
cat > "$tmp/bin/getent" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == "group" ]]; then
 case "$2" in vyron-owner|vyron-manager|vyron-leader|vyron-analyst|vyron-users) exit 0;; esac
fi
exit 1
MOCK
cat > "$tmp/bin/usermod" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_LOG"
MOCK
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH" MOCK_LOG="$tmp/usermod.log"
# simulated root so the script's privilege gate is exercised in a controlled harness
export EUID=0
# success path with no pre-existing role membership
MOCK_GROUPS="mockuser" bash "$helper" mockuser analyst
grep -q -- '-aG vyron-users mockuser' "$MOCK_LOG"
grep -q -- '-aG vyron-analyst mockuser' "$MOCK_LOG"
# conflicting role path must fail and must not call usermod again
before="$(wc -l < "$MOCK_LOG")"
if MOCK_GROUPS="mockuser vyron-owner" bash "$helper" mockuser analyst >/dev/null 2>&1; then
 echo "ERROR: conflicting role membership accepted"; exit 1
fi
after="$(wc -l < "$MOCK_LOG")"
[[ "$before" == "$after" ]] || { echo "ERROR: usermod invoked after conflict"; exit 1; }
echo "Role assignment behavior tests passed (mocked commands; no host account changes)."
