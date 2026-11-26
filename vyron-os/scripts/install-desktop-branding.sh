#!/usr/bin/env bash
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
if [[ ! -r /etc/os-release ]]; then echo "Cannot identify OS" >&2; exit 1; fi
. /etc/os-release
if [[ "${ID:-}" != ubuntu ]]; then echo "Ubuntu only; refusing." >&2; exit 1; fi
apt-get update
apt-get install -y xfce4 xfce4-goodies lightdm adwaita-gtk-theme papirus-icon-theme
# Apply system-wide defaults cautiously. Per-user XFCE settings are normally set on first login.
mkdir -p /etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml
cat > /etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xsettings" version="1.0">
 <property name="Net" type="empty">
  <property name="ThemeName" type="string" value="Adwaita-dark"/>
  <property name="IconThemeName" type="string" value="Papirus-Dark"/>
 </property>
</channel>
XML
echo "Packages installed and default skeleton theme config created. Login manager, wallpaper, and emblem integration still require build-time wiring."
