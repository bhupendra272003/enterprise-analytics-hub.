#!/usr/bin/env bash
set -euo pipefail
# XFCE-friendly MPV video wallpaper prototype (X11).
# Runs MPV on a desktop window layer and loops a user-provided video.
VIDEO="${1:-$HOME/Videos/Vyron-live-wallpaper.mp4}"
command -v mpv >/dev/null || { echo "MPV is required." >&2; exit 1; }
command -v xwinwrap >/dev/null || { echo "xwinwrap is required for desktop embedding; not bundled yet." >&2; exit 1; }
[[ -f "$VIDEO" ]] || { echo "Video file not found: $VIDEO" >&2; exit 1; }
exec xwinwrap -ov -fs -ni -s -st -sp -b -- mpv --wid WID --loop-file=inf --no-audio --no-input-default-bindings --no-osd-bar "$VIDEO"
