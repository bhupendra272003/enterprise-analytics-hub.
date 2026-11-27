#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
printf 'source iso fixture\\n' > "$tmp/source.iso"
(cd "$tmp" && sha256sum source.iso > SHA256SUMS)
touch "$tmp/signature.gpg" "$tmp/keyring.gpg"
fingerprint="0123456789ABCDEF0123456789ABCDEF01234567"
cat > "$tmp/bin/gpgv" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "--status-fd=1" && "$2" == "--keyring" && -s "$3" && -s "$4" && -s "$5" ]]
echo "[GNUPG:] VALIDSIG 0123456789ABCDEF0123456789ABCDEF01234567 20261127 0 4 0 1 10 00 ABCDEF"
MOCK
chmod +x "$tmp/bin/gpgv"
PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="$fingerprint" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg"
if PATH="$tmp/bin:$PATH" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg" >"$tmp/no-pin.log" 2>&1; then
 echo "ERROR: missing signing fingerprint pin accepted"; exit 1
fi
grep -q 'VYRON_EXPECTED_SIGNING_FINGERPRINT' "$tmp/no-pin.log"
if PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg" >"$tmp/wrong-pin.log" 2>&1; then
 echo "ERROR: unexpected signing fingerprint accepted"; exit 1
fi
grep -q 'does not match' "$tmp/wrong-pin.log"
printf 'bad hash  source.iso\\n' > "$tmp/bad-sums"
if PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="$fingerprint" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/bad-sums" "$tmp/signature.gpg" "$tmp/keyring.gpg" >/dev/null 2>&1; then
 echo "ERROR: bad checksum manifest accepted"; exit 1
fi
echo "Source integrity helper regression tests passed."
