#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
printf 'source iso fixture\n' > "$tmp/source.iso"
(cd "$tmp" && sha256sum source.iso > SHA256SUMS)
touch "$tmp/signature.gpg" "$tmp/keyring.gpg"
cat > "$tmp/bin/gpgv" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "--keyring" && -f "$2" && -f "$3" && -f "$4" ]]
echo "mock authenticated"
MOCK
chmod +x "$tmp/bin/gpgv"
PATH="$tmp/bin:$PATH" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/SHA256SUMS" "$tmp/signature.gpg" "$tmp/keyring.gpg"
printf 'bad hash  source.iso\n' > "$tmp/bad-sums"
if PATH="$tmp/bin:$PATH" bash "$ROOT/scripts/verify-source-integrity.sh" "$tmp/source.iso" "$tmp/bad-sums" "$tmp/signature.gpg" "$tmp/keyring.gpg" >/dev/null 2>&1; then
 echo "ERROR: bad checksum manifest accepted"; exit 1
fi
echo "Source integrity helper regression tests passed."
