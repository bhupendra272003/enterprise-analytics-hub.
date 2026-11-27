#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"; printf 'fixture ISO bytes\n' > "$tmp/source.iso"
cat > "$tmp/bin/xorriso" <<'MOCK'
#!/usr/bin/env bash
printf 'xorriso args:'; printf ' <%s>' "$@"; printf '\n'
case " $* " in
 *" -report_el_torito plain "*) echo 'El Torito boot catalog: present';;
 *" -ls /casper "*) echo 'filesystem.squashfs'; echo 'vmlinuz'; echo 'initrd';;
 *" -ls / "*) echo 'casper'; echo 'boot';;
 *) exit 9;;
esac
MOCK
chmod +x "$tmp/bin/xorriso"
PATH="$tmp/bin:$PATH" bash "$ROOT/scripts/inspect-base-iso.sh" "$tmp/source.iso" "$tmp/report.txt" > "$tmp/stdout.txt"
grep -q 'filesystem.squashfs' "$tmp/report.txt"
grep -q 'El Torito boot metadata' "$tmp/report.txt"
grep -q 'does not verify the publisher signature' "$tmp/report.txt"
# Reject a missing source and ensure the inspector never creates it.
if PATH="$tmp/bin:$PATH" bash "$ROOT/scripts/inspect-base-iso.sh" "$tmp/missing.iso" >/dev/null 2>&1; then
 echo 'ERROR: inspector accepted a missing ISO'; exit 1
fi
[[ ! -e "$tmp/missing.iso" ]]
echo 'Base ISO inspector regression tests passed.'
