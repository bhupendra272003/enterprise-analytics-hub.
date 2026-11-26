#!/usr/bin/env bash
set -euo pipefail
# Optional video wallpaper launcher. Requires an X11 desktop session and a user-supplied video.
# MPV is not force-started automatically; use this script to launch it interactively.
VIDEO="${1:-$HOME/Videos/Vyron-live-wallpaper.mp4}"
if ! command -v mpv >/dev/null 2>&1; then echo "MPV is not installed." >&2; exit 1; fi
if [[ ! -f "$VIDEO" ]]; then echo "Live-wallpaper video not found: $VIDEO" >&2; echo "Place a compatible video at ~/Videos/Vyron-live-wallpaper.mp4 or pass its path." >&2; exit 2; fi
exec mpv --loop-file=inf --no-audio --no-input-default-bindings --fullscreen --no-border "$VIDEO"
