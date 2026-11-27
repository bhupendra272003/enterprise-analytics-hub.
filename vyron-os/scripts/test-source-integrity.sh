#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
printf 'source iso fixture\n' > "$tmp/source.iso"
(cd "$tmp" && sha256sum source.iso > SHA256SUMS)
printf 'test signature\n' > "$tmp/signature.gpg"
printf 'test keyring\n' > "$tmp/keyring.gpg"
fingerprint="0123456789ABCDEF0123456789ABCDEF01234567"
cat > "$tmp/bin/gpgv" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${MOCK_GPGV_FAIL:-0}" == 1 ]]; then exit 9; fi
printf '%s\n' '[GNUPG:] VALIDSIG 0123456789ABCDEF0123456789ABCDEF01234567 20261127 0 4 0 1 10 00 ABCDEF'
MOCK
chmod +x "$tmp/bin/gpgv"
run(){ PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="$fingerprint" bash "$ROOT/scripts/verify-source-integrity.sh" "$@"; }
run "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg"
if PATH="$tmp/bin:$PATH" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg" >"$tmp/no-pin.log" 2>&1; then echo "ERROR: missing pin accepted"; exit 1; fi
grep -q 'VYRON_EXPECTED_SIGNING_FINGERPRINT' "$tmp/no-pin.log"
if PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg" >"$tmp/wrong-pin.log" 2>&1; then echo "ERROR: wrong fingerprint accepted"; exit 1; fi
grep -q 'does not match' "$tmp/wrong-pin.log"
printf 'bad hash  source.iso\n' > "$tmp/bad-sums"
if PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="$fingerprint" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/bad-sums" "$tmp/signature.gpg" "$tmp/keyring.gpg" >/dev/null 2>&1; then echo "ERROR: bad manifest accepted"; exit 1; fi
if PATH="$tmp/bin:$PATH" MOCK_GPGV_FAIL=1 VYRON_EXPECTED_SIGNING_FINGERPRINT="$fingerprint" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg" >"$tmp/bad-signature.log" 2>&1; then echo "ERROR: signature failure accepted"; exit 1; fi
grep -q 'signature verification failed' "$tmp/bad-signature.log"
ln -s "$tmp/source.iso" "$tmp/iso-link"
if PATH="$tmp/bin:$PATH" VYRON_EXPECTED_SIGNING_FINGERPRINT="$fingerprint" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/iso-link" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg" >"$tmp/link.log" 2>&1; then echo "ERROR: symlink ISO accepted"; exit 1; fi
grep -q 'not symlink' "$tmp/link.log"
echo "Source integrity helper regression tests passed."
