#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/intake-base-iso.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
printf 'sample ubuntu iso fixture\n' > "$tmp/source.iso"
printf 'trusted test keyring\n' > "$tmp/keyring.gpg"
printf 'test signature\n' > "$tmp/SHA256SUMS.gpg"
(cd "$tmp" && sha256sum source.iso > SHA256SUMS)
cat > "$tmp/bin/gpgv" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat > "$tmp/bin/xorriso" <<'MOCK'
#!/usr/bin/env bash
case " $* " in
  *" -report_el_torito plain "*) echo "El Torito boot catalog: present";;
  *" -ls /casper "*) echo "filesystem.squashfs"; echo "vmlinuz"; echo "initrd";;
  *" -ls / "*) echo "casper"; echo "boot";;
  *) exit 9;;
esac
MOCK
cat > "$tmp/bin/df" <<'MOCK'
#!/usr/bin/env bash
printf 'Filesystem  1024-blocks  Used Available Capacity Mounted on\n'
printf '/dev/mock 200000000 1 125829120 1%% /mock\n'
MOCK
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
VYRON_INTAKE_MIN_FREE_GB=abc bash "$SCRIPT" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/SHA256SUMS.gpg" "$tmp/keyring.gpg" "$tmp/bad-threshold" >"$tmp/threshold.log" 2>&1 && { echo "ERROR: invalid threshold accepted"; exit 1; }
grep -q 'must be a positive whole number' "$tmp/threshold.log"
bash "$SCRIPT" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/SHA256SUMS.gpg" "$tmp/keyring.gpg" "$tmp/candidate"
test -s "$tmp/candidate/intake-evidence.txt"
test -s "$tmp/candidate/base-iso-inspection.txt"
test -s "$tmp/candidate/SHA256SUMS"
test -s "$tmp/candidate/SHA256SUMS.gpg"
grep -q 'filesystem.squashfs' "$tmp/candidate/base-iso-inspection.txt"
grep -q 'Source ISO: .*source.iso' "$tmp/candidate/intake-evidence.txt"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/SHA256SUMS.gpg" "$tmp/keyring.gpg" "$tmp/candidate" >"$tmp/overwrite.log" 2>&1; then echo "ERROR: existing candidate overwritten"; exit 1; fi
grep -q 'already exists; refusing overwrite' "$tmp/overwrite.log"
printf 'bad checksum\n' > "$tmp/bad.iso"
printf '0000000000000000000000000000000000000000000000000000000000000000  bad.iso\n' > "$tmp/bad-SHA256SUMS"
if bash "$SCRIPT" "$tmp/bad.iso" "$tmp/bad-SHA256SUMS" "$tmp/SHA256SUMS.gpg" "$tmp/keyring.gpg" "$tmp/bad-candidate" >"$tmp/checksum.log" 2>&1; then echo "ERROR: invalid ISO checksum accepted"; exit 1; fi
grep -q 'checksum mismatch' "$tmp/checksum.log"
test ! -e "$tmp/bad-candidate"
echo 'Authenticated base ISO intake tests passed.'
