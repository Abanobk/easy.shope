#!/usr/bin/env sh
# Run on TrueNAS as root (Web Shell or SSH with password).
# Installs the GitHub Actions deploy public key for user root.
#
# Usage:
#   sh truenas-set-authorized-keys.sh
#
# Optional: pass a different public key line as first argument.

set -eu

# Public key for ~/.ssh/github_deploy_easyshope (safe to commit — not the private key).
DEFAULT_DEPLOY_PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOeuTgWMpn1+/z0f37yp5HJkWHxy1N/i5vw3NHmD3qVd github-actions-easy-shope'

KEY_LINE="${1:-$DEFAULT_DEPLOY_PUBKEY}"

case "$KEY_LINE" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *) ;;
  *)
    echo "Error: invalid public key line." >&2
    exit 1
    ;;
esac

mkdir -p /root/.ssh
chmod 700 /root/.ssh
printf '%s\n' "$KEY_LINE" > /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo "Installed. Fingerprint:"
ssh-keygen -lf /root/.ssh/authorized_keys
echo "On Mac, test (use your NAS Tailscale IP):"
echo "  ssh -o BatchMode=yes -o PasswordAuthentication=no -i ~/.ssh/github_deploy_easyshope root@100.96.29.106 'echo ok'"
