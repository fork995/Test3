#!/bin/sh
set -eu
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
base=/home/admin/clevervet-runtime
node=$base/node-v22.23.5-linux-arm64/bin/node
cd "$base/photo-backend"

env MOCK_MODE=true MOCK_JWT_SECRET_FILE="$base/mock-jwt-secret" \
  MOCK_ALLOWED_SUBJECT=synthetic-doctor MOCK_PILOT_PATIENT_ID=synthetic-patient \
  "$node" dist/server.js >> "$base/photo-backend.log" 2>&1 &

env ADMIN_PASSWORD_HASH_FILE="$base/admin-password.hash" \
  BROWSER_LAUNCH_SCRIPT="$base/photo-backend/deploy/browser-session.sh" \
  VNC_PASSWORD_FILE=/dev/shm/clevervet-vnc-password \
  ADMIN_BROWSER_MINUTES=30 "$node" dist/admin.js >> "$base/admin.log" 2>&1 &

until ip -4 -o addr show | grep -q '192.168.3.108/'; do
  sleep 5
done

env LAN_HTTPS_ADDRESS=192.168.3.108 LAN_HTTPS_PORT=8443 \
  LAN_HTTPS_KEY_FILE="$base/lan-tls/server.key" \
  LAN_HTTPS_CERT_FILE="$base/lan-tls/server.crt" \
  "$node" "$base/photo-backend/deploy/lan-https.mjs" >> "$base/lan-https.log" 2>&1 &

wait
