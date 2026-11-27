#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$ROOT/scripts/provision-user.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mock="$tmp/bin"; mkdir -p "$mock"
export MOCK_LOG="$tmp/log"
cat > "$mock/getent" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" == group ]] && exit 0
exit 1
MOCK
cat > "$mock/id" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" == -nG ]] && { echo ""; exit 0; }
exit 0
MOCK
cat > "$mock/adduser" <<'MOCK'
#!/usr/bin/env bash
echo "adduser:$*" >> "$MOCK_LOG"
[[ "${MOCK_ADDUSER_FAIL:-0}" != 1 ]]
MOCK
cat > "$mock/passwd" <<'MOCK'
#!/usr/bin/env bash
echo "passwd:$*" >> "$MOCK_LOG"
[[ "${MOCK_PASSWD_FAIL:-0}" != 1 ]]
MOCK
cat > "$mock/usermod" <<'MOCK'
#!/usr/bin/env bash
echo "usermod:$*" >> "$MOCK_LOG"
MOCK
cat > "$mock/userdel" <<'MOCK'
#!/usr/bin/env bash
echo "userdel:$*" >> "$MOCK_LOG"
MOCK
chmod +x "$mock"/*
run(){ PATH="$mock:$PATH" VYRON_TEST_MODE=1 MOCK_LOG="$MOCK_LOG" "$@" ; }
# Success: creates account, sets password, and assigns groups through helper.
: > "$MOCK_LOG"
printf 'vyron_test\nTest User\n1\ny\n' | PATH="$mock:$PATH" VYRON_TEST_MODE=1 MOCK_LOG="$MOCK_LOG" bash "$helper"
grep -q '^adduser:' "$MOCK_LOG"; grep -q '^passwd:' "$MOCK_LOG"; grep -q 'usermod:.*vyron-users' "$MOCK_LOG"; grep -q 'usermod:.*vyron-analyst' "$MOCK_LOG"
# Cancellation must not create account or alter groups.
: > "$MOCK_LOG"
printf 'vyron_test\nTest User\n1\nn\n' | PATH="$mock:$PATH" VYRON_TEST_MODE=1 MOCK_LOG="$MOCK_LOG" bash "$helper"
! grep -q '^adduser:' "$MOCK_LOG"; ! grep -q '^usermod:' "$MOCK_LOG"
# Password failure must rollback newly created account.
: > "$MOCK_LOG"
if printf 'vyron_test\nTest User\n1\ny\n' | PATH="$mock:$PATH" VYRON_TEST_MODE=1 MOCK_LOG="$MOCK_LOG" MOCK_PASSWD_FAIL=1 bash "$helper"; then
 echo "ERROR: password failure unexpectedly succeeded"; exit 1
fi
grep -q '^userdel:' "$MOCK_LOG"; ! grep -q '^usermod:' "$MOCK_LOG"
# Invalid role must abort before confirmation or account creation.
: > "$MOCK_LOG"
if printf 'vyron_test\nTest User\n9\ny\n' | PATH="$mock:$PATH" VYRON_TEST_MODE=1 MOCK_LOG="$MOCK_LOG" bash "$helper"; then
 echo "ERROR: invalid role unexpectedly succeeded"; exit 1
fi
! grep -q '^adduser:' "$MOCK_LOG"; ! grep -q '^usermod:' "$MOCK_LOG"
# Account creation failure must not trigger account removal or role assignment.
: > "$MOCK_LOG"
if printf 'vyron_test\nTest User\n1\ny\n' | PATH="$mock:$PATH" VYRON_TEST_MODE=1 MOCK_LOG="$MOCK_LOG" MOCK_ADDUSER_FAIL=1 bash "$helper"; then
 echo "ERROR: adduser failure unexpectedly succeeded"; exit 1
fi
! grep -q '^userdel:' "$MOCK_LOG"; ! grep -q '^usermod:' "$MOCK_LOG"
echo "Provisioning execution tests (success, cancellation, role rejection, creation failure, rollback) passed."
