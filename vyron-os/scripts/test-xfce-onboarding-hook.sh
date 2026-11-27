#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$ROOT/config/hooks/live/1100-vyron-xfce-onboarding.hook.chroot"
bash -n "$hook"
grep -Fq 'welcome.sh' "$hook"
grep -Fq 'zenity --info' "$hook"
grep -Fq 'marker="\${HOME}/.config/vyron/welcome-shown"' "$hook"
grep -Fq 'if [[ ! -e "$marker" ]]' "$hook"
grep -Fq 'touch "$marker"' "$hook"
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
xml=hook.split("cat > /etc/xdg/xfce4/xfconf/xfconf-perchannel-xml/xfce4-desktop.xml <<'XML'\n",1)
# Validate the embedded desktop XML at the actual hook target path.
xml=hook.split("cat > /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml <<'XML'\n",1)[1].split('\nXML\n',1)[0]
ET.fromstring(xml)
theme=(root/'desktop/xfce/desktop-theme.conf').read_text()
assert 'WALLPAPER=/usr/share/backgrounds/vyron/wallpaper.svg' in theme, 'theme reference must match installed wallpaper'
assert 'WALLPAPER=desktop/branding/wallpaper.jpg' not in theme, 'obsolete wallpaper reference'
assert 'ICON_THEME=Papirus-Dark' in theme
assert 'GTK_THEME=Adwaita-dark' in theme
print('XFCE wallpaper SVG, embedded XML and theme reference validated.')
PY
echo "XFCE onboarding hook static checks passed."
