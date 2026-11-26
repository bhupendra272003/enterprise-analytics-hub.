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
echo "CI structural checks passed (not an ISO build/boot test)."
