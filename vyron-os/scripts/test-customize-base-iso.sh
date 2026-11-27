#!/usr/bin/env bash
set -euo pipefail
trap 'echo "ERROR: customization regression test failed at line $LINENO" >&2' ERR
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/customize-base-iso.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf 'fixture ISO\n' > "$tmp/source.iso"
printf 'actions: []\n' > "$tmp/actions.yaml"
mkdir -p "$tmp/intake"
(cd "$tmp" && sha256sum source.iso > intake/SHA256SUMS)
printf 'mock detached signature\n' > "$tmp/intake/SHA256SUMS.gpg"
printf 'mock trusted keyring\n' > "$tmp/keyring.gpg"
printf 'Source ISO: %s\nSource SHA256: %s\nPinned signing-key fingerprint: %s\n' "$(realpath "$tmp/source.iso")" "$(sha256sum "$tmp/source.iso" | awk '{print toupper($1)}')" "0123456789ABCDEF0123456789ABCDEF01234567" > "$tmp/intake/intake-evidence.txt"
export VYRON_EXPECTED_SIGNING_FINGERPRINT="0123456789ABCDEF0123456789ABCDEF01234567"
# A valid intake must be cryptographically rechecked before the privileged execution guard.
mkdir -p "$tmp/mock-bin"
cat > "$tmp/mock-bin/gpgv" <<'MOCK'
#!/usr/bin/env bash
printf '[GNUPG:] VALIDSIG 0123456789ABCDEF0123456789ABCDEF01234567 20261127 0 4 0 1 10 00 ABCDEF\\n'
MOCK
chmod +x "$tmp/mock-bin/gpgv"
if PATH="$tmp/mock-bin:$PATH" bash "$SCRIPT" "$tmp/source.iso" "$tmp/verified-output.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/verified.log" 2>&1; then
  echo 'ERROR: customization unexpectedly passed the root execution guard in CI' >&2; exit 1
fi
grep -q 'Signing-key fingerprint matches' "$tmp/verified.log"
grep -q 'Checksum matches' "$tmp/verified.log"
grep -q 'livefs-edit requires root' "$tmp/verified.log"
for value in abc 0 -5 1.5; do
  if VYRON_CUSTOMIZE_MIN_FREE_GB="$value" bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/out" 2>&1; then
    echo "ERROR: accepted invalid customization disk threshold: $value" >&2; exit 1
  fi
  grep -q 'VYRON_CUSTOMIZE_MIN_FREE_GB must be a positive whole number' "$tmp/out"
done
if PATH="$tmp/mock-bin:$PATH" bash "$SCRIPT" "$tmp/source.iso" "$tmp/source.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/same.log" 2>&1; then
  echo 'ERROR: accepted source as destination' >&2; exit 1
fi
grep -q 'destination must differ from source' "$tmp/same.log"
printf 'existing output must survive\n' > "$tmp/existing.iso"
if PATH="$tmp/mock-bin:$PATH" bash "$SCRIPT" "$tmp/source.iso" "$tmp/existing.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/existing.log" 2>&1; then
  echo 'ERROR: accepted existing destination' >&2; exit 1
fi
grep -q 'destination already exists; refusing overwrite' "$tmp/existing.log"
grep -q 'existing output must survive' "$tmp/existing.iso"
if bash "$SCRIPT" "$tmp/missing.iso" "$tmp/output.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/missing-source.log" 2>&1; then
  echo 'ERROR: accepted missing source ISO' >&2; exit 1
fi
grep -q 'source ISO unreadable' "$tmp/missing-source.log"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/missing.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/missing-actions.log" 2>&1; then
  echo 'ERROR: accepted missing action YAML' >&2; exit 1
fi
grep -q 'action YAML unreadable' "$tmp/missing-actions.log"
# Evidence must exist and bind the exact source path and bytes.
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/actions.yaml" "$tmp/missing-intake" "$tmp/keyring.gpg" >"$tmp/missing-evidence.log" 2>&1; then
  echo 'ERROR: accepted missing intake evidence' >&2; exit 1
fi
grep -q 'authenticated intake evidence directory unreadable' "$tmp/missing-evidence.log"
mkdir -p "$tmp/wrong-intake"
cp "$tmp/intake/SHA256SUMS" "$tmp/wrong-intake/SHA256SUMS"
cp "$tmp/intake/SHA256SUMS.gpg" "$tmp/wrong-intake/SHA256SUMS.gpg"
printf 'Source ISO: %s\nSource SHA256: %s\nPinned signing-key fingerprint: %s\n' "$(realpath "$tmp/source.iso")" "0000000000000000000000000000000000000000000000000000000000000000" "$VYRON_EXPECTED_SIGNING_FINGERPRINT" > "$tmp/wrong-intake/intake-evidence.txt"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/actions.yaml" "$tmp/wrong-intake" "$tmp/keyring.gpg" >"$tmp/wrong-evidence.log" 2>&1; then
  echo 'ERROR: accepted evidence for different source bytes' >&2; exit 1
fi
grep -q 'intake evidence does not match' "$tmp/wrong-evidence.log"
mkdir -p "$tmp/wrong-fingerprint-intake"
cp "$tmp/intake/SHA256SUMS" "$tmp/wrong-fingerprint-intake/SHA256SUMS"
cp "$tmp/intake/SHA256SUMS.gpg" "$tmp/wrong-fingerprint-intake/SHA256SUMS.gpg"
printf 'Source ISO: %s\nSource SHA256: %s\nPinned signing-key fingerprint: %s\n' "$(realpath "$tmp/source.iso")" "$(sha256sum "$tmp/source.iso" | awk '{print toupper($1)}')" "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" > "$tmp/wrong-fingerprint-intake/intake-evidence.txt"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/output.iso" "$tmp/actions.yaml" "$tmp/wrong-fingerprint-intake" "$tmp/keyring.gpg" >"$tmp/wrong-fingerprint.log" 2>&1; then
  echo 'ERROR: accepted mismatched signing-key pin' >&2; exit 1
fi
grep -q 'signing-key fingerprint must match' "$tmp/wrong-fingerprint.log"
# Symlink source, actions and destination must fail closed.
ln -s "$tmp/source.iso" "$tmp/source-link.iso"
if bash "$SCRIPT" "$tmp/source-link.iso" "$tmp/link-output.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/source-link.log" 2>&1; then echo 'ERROR: symlink source accepted'; exit 1; fi
grep -q 'symlink input is not accepted' "$tmp/source-link.log"
ln -s "$tmp/actions.yaml" "$tmp/actions-link.yaml"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/actions-link-output.iso" "$tmp/actions-link.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/actions-link.log" 2>&1; then echo 'ERROR: symlink actions accepted'; exit 1; fi
grep -q 'symlink input is not accepted' "$tmp/actions-link.log"
ln -s "$tmp/nonexistent-output" "$tmp/output-link.iso"
if bash "$SCRIPT" "$tmp/source.iso" "$tmp/output-link.iso" "$tmp/actions.yaml" "$tmp/intake" "$tmp/keyring.gpg" >"$tmp/output-link.log" 2>&1; then echo 'ERROR: symlink destination accepted'; exit 1; fi
grep -q 'symlink destination is not accepted' "$tmp/output-link.log"
echo 'Customization wrapper safety regression tests passed (inputs, evidence binding, pin, threshold, source/destination and overwrite).'
