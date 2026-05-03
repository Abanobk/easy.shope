#!/bin/sh
# انسخ هذا الملف كاملًا والصقه في TrueNAS Web Shell أو SSH (كـ root) وشغّله:
#   sh paste-on-truenas-root-authorized-keys.sh
# أو: sh -s < paste-on-truenas-root-authorized-keys.sh

set -eu

mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat > /root/.ssh/authorized_keys << 'ENDOFKEY'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOeuTgWMpn1+/z0f37yp5HJkWHxy1N/i5vw3NHmD3qVd github-actions-easy-shope
ENDOFKEY
chmod 600 /root/.ssh/authorized_keys

echo "Done. Fingerprint:"
ssh-keygen -lf /root/.ssh/authorized_keys
