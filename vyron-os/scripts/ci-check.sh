#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "VyronOS CI checks"
bash "$ROOT/scripts/preflight.sh"
bash "$ROOT/scripts/validate-security-config.sh"
bash "$ROOT/scripts/test-security-config.sh"
bash "$ROOT/scripts/test-security-hook.sh"
bash "$ROOT/scripts/test-source-integrity.sh"
bash "$ROOT/scripts/test-iso-evidence.sh"
bash "$ROOT/scripts/test-release-readiness-snapshot.sh"
bash "$ROOT/scripts/test-inspect-base-iso.sh"
bash "$ROOT/scripts/test-builder-host-check.sh"
bash "$ROOT/scripts/test-customize-base-iso.sh"
bash "$ROOT/scripts/test-intake-base-iso.sh"
for script in "$ROOT"/scripts/*.sh; do bash -n "$script"; done
for hook in "$ROOT"/config/hooks/live/*.hook.chroot; do bash -n "$hook"; done
if command -v xmllint >/dev/null 2>&1; then
 xmllint --noout "$ROOT/desktop/branding/lion-mark.svg" "$ROOT/desktop/branding/wallpaper.svg"
else
 python3 - "$ROOT" <<'PY'
import sys, xml.etree.ElementTree as ET
from pathlib import Path
root=Path(sys.argv[1])
for f in (root/'desktop/branding/lion-mark.svg',root/'desktop/branding/wallpaper.svg'):
 ET.parse(f)
 print('SVG parsed:',f.name)
PY
fi

# Package manifest syntax audit; apt-cache results are advisory only.
echo "Package manifest audit:"
# Run the strict package-candidate audit only on a genuine Ubuntu 24.04 Noble host.
if [[ -r /etc/os-release ]]; then
 . /etc/os-release
 if [[ "${ID:-}" == ubuntu && "${VERSION_CODENAME:-}" == noble ]]; then
  bash "$ROOT/scripts/audit-noble-packages.sh"
 else
  echo "SKIP: strict Noble candidate audit (runner is not Ubuntu 24.04 Noble)."
 fi
else
 echo "SKIP: strict Noble candidate audit (/etc/os-release unavailable)."
fi
missing=0
invalid=0
while IFS= read -r raw || [[ -n "$raw" ]]; do
 pkg="$(printf '%s' "$raw" | sed 's/[[:space:]]//g')"
 [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
 if [[ ! "$pkg" =~ ^[a-z0-9][a-z0-9+.-]*$ ]]; then
  echo "INVALID NAME: $raw"; invalid=$((invalid+1)); continue
 fi
 if command -v apt-cache >/dev/null 2>&1 && apt-cache policy "$pkg" 2>/dev/null | grep -qE 'Candidate: [0-9][^[:space:]]*'; then
  echo "CANDIDATE: $pkg"
 else
  echo "NO CANDIDATE/UNKNOWN: $pkg"; missing=$((missing+1))
 fi
done < "$ROOT/config/packages.list"
echo "No candidate/unknown: $missing; invalid names: $invalid (advisory)"
(( invalid == 0 )) || exit 1
# Smoke-test checksum helper against a temporary fixture (no real ISO required).
helper="$ROOT/scripts/verify-iso-checksum.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
printf 'fixture ISO data\n' > "$tmpdir/test.iso"
(cd "$tmpdir" && sha256sum test.iso > SHA256SUMS)
bash "$helper" "$tmpdir/test.iso" "$tmpdir/SHA256SUMS"
# Negative test: a modified checksum must be rejected.
printf '0000000000000000000000000000000000000000000000000000000000000000  test.iso\n' > "$tmpdir/bad-sums"
if bash "$helper" "$tmpdir/test.iso" "$tmpdir/bad-sums" >/dev/null 2>&1; then
 echo "ERROR: checksum helper accepted an incorrect hash"; exit 1
fi
echo "Checksum helper positive and negative smoke tests passed."

# Role helper tests include dry-run and mocked execution (no host account/group changes).
bash "$ROOT/scripts/test-assign-role.sh"
bash "$ROOT/scripts/test-provision-user.sh"
bash "$ROOT/scripts/test-first-user-install-hook.sh"
bash "$ROOT/scripts/test-xfce-onboarding-hook.sh"
bash "$ROOT/scripts/test-lightdm-branding-hook.sh"

# Local groups hook idempotency and expected-directory command tests (mocked).
bash "$ROOT/scripts/test-local-groups-hook.sh"

echo "All CI structural and smoke checks passed (not an ISO build or boot test)."
