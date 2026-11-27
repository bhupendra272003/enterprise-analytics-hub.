#!/usr/bin/env bash
# Isolated mocked tests: never modifies host users/groups.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$ROOT/scripts/assign-role.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
export MOCK_LOG="$tmp/log" MOCK_GROUPS="$tmp/groups"
: > "$MOCK_LOG"; : > "$MOCK_GROUPS"
cat > "$tmp/bin/id" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == "-nG" ]]; then echo "${MOCK_MEMBERSHIP:-vyron-users}"; exit 0; fi
exit 0
MOCK
cat > "$tmp/bin/getent" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" == "group" ]] || exit 1
grep -q "^$2:" "$MOCK_GROUPS"
MOCK
cat > "$tmp/bin/usermod" <<'MOCK'
#!/usr/bin/env bash
echo "$*" >> "$MOCK_LOG"
MOCK
for g in vyron-users vyron-owner vyron-manager vyron-leader vyron-analyst; do echo "$g:x:900:" >> "$MOCK_GROUPS"; done
chmod +x "$tmp/bin/"*
for role in owner manager leader analyst; do
 output="$(bash "$helper" --dry-run test-user "$role")"
 grep -q "role '$role'" <<<"$output"
done
if bash "$helper" --dry-run test-user invalid >/dev/null 2>&1; then echo "ERROR: invalid role accepted"; exit 1; fi
if bash "$helper" --dry-run "bad user" analyst >/dev/null 2>&1; then echo "ERROR: invalid username accepted"; exit 1; fi
# Execute actual assignment logic in an explicitly isolated mock mode.
PATH="$tmp/bin:$PATH" VYRON_TEST_MODE=1 bash "$helper" test-user analyst
[[ "$(wc -l < "$MOCK_LOG")" -eq 2 ]]
grep -q -- "-aG vyron-users test-user" "$MOCK_LOG"
grep -q -- "-aG vyron-analyst test-user" "$MOCK_LOG"
# Conflicting pre-existing role membership must fail before any mutation.
: > "$MOCK_LOG"
if PATH="$tmp/bin:$PATH" MOCK_MEMBERSHIP="vyron-users vyron-manager" VYRON_TEST_MODE=1 bash "$helper" test-user analyst >/dev/null 2>&1; then echo "ERROR: conflicting role was accepted"; exit 1; fi
[[ ! -s "$MOCK_LOG" ]]
# Reassigning the already-held role is idempotent; only common group is refreshed.
: > "$MOCK_LOG"
PATH="$tmp/bin:$PATH" MOCK_MEMBERSHIP="vyron-users vyron-analyst" VYRON_TEST_MODE=1 bash "$helper" test-user analyst
[[ "$(wc -l < "$MOCK_LOG")" -eq 1 ]]
grep -q -- "-aG vyron-users test-user" "$MOCK_LOG"
if grep -q -- "-aG vyron-analyst test-user" "$MOCK_LOG"; then echo "ERROR: redundant role mutation occurred"; exit 1; fi
echo "Role assignment mocked execution, dry-run, input validation, conflict and idempotency tests passed."
