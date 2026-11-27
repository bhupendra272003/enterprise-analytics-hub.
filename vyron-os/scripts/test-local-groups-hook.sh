#!/usr/bin/env bash
# Test the live groups hook in a command-mocked sandbox; no host groups or directories touched.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$ROOT/config/hooks/live/0800-vyron-local-groups.hook.chroot"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
export MOCK_GROUP_DB="$tmp/groups" MOCK_LOG="$tmp/log"
: > "$MOCK_GROUP_DB"; : > "$MOCK_LOG"
cat > "$tmp/bin/getent" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" == "group" ]] || exit 1
grep -q "^$2:" "$MOCK_GROUP_DB"
MOCK
cat > "$tmp/bin/groupadd" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" == "--system" ]] || exit 1
if grep -q "^$2:" "$MOCK_GROUP_DB"; then exit 1; fi
echo "$2:x:900:" >> "$MOCK_GROUP_DB"
echo "groupadd $2" >> "$MOCK_LOG"
MOCK
cat > "$tmp/bin/install" <<'MOCK'
#!/usr/bin/env bash
echo "install $*" >> "$MOCK_LOG"
MOCK
chmod +x "$tmp/bin/"*
PATH="$tmp/bin:$PATH" bash "$hook" >/dev/null
expected=(vyron-users vyron-owner vyron-manager vyron-leader vyron-analyst vyron-data vyron-audit)
for group in "${expected[@]}"; do grep -q "^$group:" "$MOCK_GROUP_DB"; done
[[ "$(wc -l < "$MOCK_GROUP_DB")" -eq 7 ]]
expected_dirs=(
  "install -d -o root -g vyron-data -m 2770 /srv/vyron/shared"
  "install -d -o root -g vyron-audit -m 0750 /var/log/vyron"
  "install -d -o root -g vyron-users -m 0750 /etc/vyron"
 )
for expected_cmd in "${expected_dirs[@]}"; do grep -Fqx "$expected_cmd" "$MOCK_LOG"; done
[[ "$(grep -c '^install ' "$MOCK_LOG")" -eq 3 ]]
# Second invocation must be idempotent for groups.
PATH="$tmp/bin:$PATH" bash "$hook" >/dev/null
[[ "$(wc -l < "$MOCK_GROUP_DB")" -eq 7 ]]
[[ "$(grep -c '^groupadd ' "$MOCK_LOG")" -eq 7 ]]
[[ "$(grep -c '^install ' "$MOCK_LOG")" -eq 6 ]]
for expected_cmd in "${expected_dirs[@]}"; do [[ "$(grep -Fxc "$expected_cmd" "$MOCK_LOG")" -eq 2 ]]; done
echo "Local group hook tests passed (mocked commands; no host changes)."
