#!/bin/sh
set -eu
case "${1:-}" in
  "https://dev-l4aq9wjx.eu.auth0.com/authorize?"*) ;;
  *) exit 2 ;;
esac
base=/home/admin/clevervet-runtime
IFS= read -r profile < /dev/shm/clevervet-browser-profile
case "$profile" in
  /dev/shm/clevervet-browser.*) [ -d "$profile" ] ;;
  *) exit 2 ;;
esac
display_root=$base/display-libs/root
browser_root=$base/browser-libs/root
export LD_LIBRARY_PATH="$display_root/usr/lib/aarch64-linux-gnu:$browser_root/usr/lib/aarch64-linux-gnu"
export FONTCONFIG_FILE="$browser_root/etc/fonts/fonts.conf"
export XDG_DATA_DIRS="$browser_root/usr/share:$display_root/usr/share:/usr/share"
export DISPLAY=:99
exec "$base/pw-browsers/chromium-1255/chrome-linux-arm64/chrome" --user-data-dir="$profile" --new-tab "$1" >/dev/null 2>&1
