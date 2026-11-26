# Live wallpaper

VyronOS includes MPV as a media engine and an opt-in launcher for looping wallpaper videos.

`scripts/start-live-wallpaper.sh [video-path]` launches the video fullscreen and loops it without audio. Default path is `~/Videos/Vyron-live-wallpaper.mp4`.

**Current status:** This is an opt-in fullscreen video launcher, not yet a true desktop-background compositor integration or a bundled animated 3D wallpaper. Fullscreen video can obscure desktop windows/icons depending on XFCE compositor/window manager. Do not enable it as automatic startup until verified in a VM. The static branded SVG remains the fallback.

Future implementation should test an X11 wallpaper layer (e.g. a dedicated wallpaper host/window) and ship an optimized, licensed video asset. Avoid downloading untrusted wallpaper executables.
