# Desktop branding integration status

## Build hooks currently committed
- `config/hooks/live/0100-vyron-branding.hook.chroot`: sets new-user XFCE GTK defaults and LightDM GTK theme defaults where configuration files are present.
- `config/hooks/live/0200-vyron-hostname.hook.chroot`: sets image hostname and hosts entry.

## Remaining integration
- Hook file executable permissions must be confirmed in Git; live-build hooks should be executable.
- The lion SVG is not yet copied into LightDM or desktop menus.
- Wallpaper is not yet supplied or installed.
- Login greeter welcome message/name typography is not yet customized.
- These hooks are prototype scaffolding and need validation in an actual build.
- Existing-user XFCE settings may differ from /etc/skel defaults.
