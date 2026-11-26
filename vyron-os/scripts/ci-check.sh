#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "VyronOS CI checks"
bash "$ROOT/scripts/preflight.sh"
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

# Advisory package availability audit using runner repository metadata.
echo "Package availability audit (advisory):"
missing=0
while IFS= read -r pkg; do
 [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
 if apt-cache show "$pkg" >/dev/null 2>&1; then echo "FOUND: $pkg"; else echo "MISSING/UNKNOWN: $pkg"; missing=$((missing+1)); fi
done < "$ROOT/config/packages.list"
echo "Packages missing/unknown in runner cache: $missing"
echo "CI structural checks passed (not an ISO build or boot test)."
