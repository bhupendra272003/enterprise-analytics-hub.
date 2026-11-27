#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$ROOT/config/hooks/live/1200-vyron-lightdm-branding.hook.chroot"
bash -n "$hook"
grep -Fq 'lightdm-gtk-greeter.conf' "$hook"
grep -Fq 'background=/usr/share/backgrounds/vyron/wallpaper.svg' "$hook"
grep -Fq 'logo=/usr/share/pixmaps/vyron/lion-mark.svg' "$hook"
grep -Fq 'theme-name=Arc-Dark' "$hook"
grep -Fq 'hide-users=true' "$hook"
grep -Fq 'user-session=xfce' "$hook"
grep -Fq 'show-manual-login=false' "$hook"
grep -Fq 'indicators=~host;~spacer;~clock;~spacer;~session;~language;~a11y;~power' "$hook"
grep -Fq 'position=50% 50%' "$hook"
grep -Fq 'greeter-session=lightdm-gtk-greeter' "$hook"
if grep -Eiq 'autologin-user[[:space:]]*=' "$hook"; then
 echo "ERROR: greeter hook must not enable autologin"; exit 1
fi
grep -Fq 'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../..' "$hook"
python3 - "$ROOT" <<'PY'
import sys, xml.etree.ElementTree as ET
from pathlib import Path
root=Path(sys.argv[1])
for asset in ('wallpaper.svg','lion-mark.svg'):
 ET.parse(root/'desktop/branding'/asset)
print('LightDM branding source SVG assets parsed.')
PY
echo "LightDM branding hook static checks passed."
