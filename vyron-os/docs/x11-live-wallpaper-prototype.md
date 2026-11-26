# X11 embedded live wallpaper prototype

This launcher uses `xwinwrap` to place MPV on an X11 desktop background layer. It is an experimental optional script; xwinwrap is not currently packaged and must be independently reviewed and installed before use.

Usage:
`scripts/start-x11-live-wallpaper.sh [video-path]`

Default video path: `~/Videos/Vyron-live-wallpaper.mp4`.

Requirements/limitations:
- XFCE running an X11 session (not Wayland).
- xwinwrap executable installed separately; package source/compatibility not validated.
- MPV and video file present.
- Not enabled at login and not tested yet.
- Prefer short, compressed, silent video to limit CPU/GPU and battery use.
- Static wallpaper is the fallback.

Do not install unreviewed binaries or scripts. Test window layering, workspace switching, icons and suspend/resume in a VM first.
