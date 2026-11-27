#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$ROOT/config/hooks/live/1100-vyron-xfce-onboarding.hook.chroot"
bash -n "$hook"
grep -Fq 'welcome.sh' "$hook"
grep -Fq 'zenity --info' "$hook"
grep -Fq 'welcome.desktop' "$hook"
grep -Fq 'Setup Workstation User' "$hook"
grep -Fq 'Exec=xfce4-terminal --command "sudo vyron-first-user"' "$hook"
grep -Fq '/etc/skel/Desktop/Vyron-Setup-User.desktop' "$hook"
grep -Fq 'wallpaper.svg' "$hook"
grep -Fq '/etc/skel/.config/autostart/vyron-welcome.desktop' "$hook"
grep -Fq 'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../..' "$hook"
grep -Fq 'zenity' "$ROOT/config/packages.list"
python3 - "$ROOT" <<'PY'
import sys, xml.etree.ElementTree as ET
from pathlib import Path
root=Path(sys.argv[1])
ET.parse(root/'desktop/branding/wallpaper.svg')
hook=(root/'config/hooks/live/1100-vyron-xfce-onboarding.hook.chroot').read_text()
xml=hook.split("cat > /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml <<'XML'\n",1)[1].split('\nXML\n',1)[0]
ET.fromstring(xml)
print("XFCE wallpaper SVG and embedded XML validated.")
PY
echo "XFCE onboarding hook static checks passed."
