#!/bin/sh
set -eu
umask 077
base=/home/admin/clevervet-runtime
event_log=${ADMIN_BROWSER_EVENT_LOG:-/home/admin/clevervet-runtime/browser-events.log}
log_stage() { printf '%s stage=%s\n' "$(date -u +%FT%TZ)" "$1" >> "$event_log"; chmod 600 "$event_log"; }
stage=init
log_stage "$stage"
profile=$(mktemp -d /dev/shm/clevervet-browser.XXXXXXXX)
profile_pointer=/dev/shm/clevervet-browser-profile
printf '%s\n' "$profile" > "$profile_pointer"
password_file=/dev/shm/clevervet-vnc-password
rm -f -- "$password_file"
display_root=$base/display-libs/root
browser_root=$base/browser-libs/root
export LD_LIBRARY_PATH="$display_root/usr/lib/aarch64-linux-gnu:$browser_root/usr/lib/aarch64-linux-gnu"
export FONTCONFIG_FILE="$browser_root/etc/fonts/fonts.conf"
export XDG_DATA_DIRS="$browser_root/usr/share:$display_root/usr/share:/usr/share"
export XKB_CONFIG_ROOT=/usr/share/X11/xkb
export PYTHONPATH="$base/websockify-libs/root/usr/lib/python3/dist-packages"
export DISPLAY=:99
cleanup() {
  code=$?
  log_stage "exit_${stage}_${code}"
  for pid in ${chrome_pid:-} ${web_pid:-} ${vnc_pid:-} ${display_pid:-}; do
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  done
  case "$profile" in /dev/shm/clevervet-browser.*) rm -rf -- "$profile" ;; esac
  case "${password_tmp:-}" in /dev/shm/clevervet-vnc-password.*) rm -f -- "$password_tmp" ;; esac
  rm -f -- "$password_file"
  rm -f -- "$profile_pointer"
  rm -f -- /dev/shm/clevervet-browser-control.sock
}
trap cleanup EXIT INT TERM
"$display_root/usr/bin/Xvfb" :99 -screen 0 1024x768x24 -nolisten tcp >/dev/null 2>&1 &
display_pid=$!
stage=display
sleep 2
kill -0 "$display_pid"
setxkbmap -display :99 -layout us
log_stage "$stage"
password_tmp=$(mktemp /dev/shm/clevervet-vnc-password.XXXXXXXX)
openssl rand -hex 4 > "$password_tmp"
chmod 600 "$password_tmp"
mv -f -- "$password_tmp" "$password_file"
"$display_root/usr/bin/x11vnc" -display :99 -localhost -rfbport 5900 -passwdfile "$password_file" -forever -shared >/dev/null 2>&1 &
vnc_pid=$!
stage=vnc
python3 "$base/websockify-libs/root/usr/bin/websockify" --web "$base/noVNC" 127.0.0.1:6080 127.0.0.1:5900 >/dev/null 2>&1 &
web_pid=$!
stage=websockify
"$base/node-v22.23.5-linux-arm64/bin/node" "$base/photo-backend/deploy/browser-session.mjs" "$profile" >/dev/null 2>&1 &
chrome_pid=$!
stage=chromium
log_stage "$stage"
wait "$chrome_pid"
