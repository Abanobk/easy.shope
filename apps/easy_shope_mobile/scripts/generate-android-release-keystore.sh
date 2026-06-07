#!/usr/bin/env bash
# Generates a release keystore for signing tenant APKs (run once, keep safe).
# Then add the four ANDROID_* secrets to GitHub repo Settings → Secrets → Actions.
set -euo pipefail

OUT_DIR="${OUT_DIR:-.}"
KEYSTORE="${OUT_DIR}/easy-shope-release.jks"
ALIAS="${KEY_ALIAS:-easyshope}"
VALIDITY_DAYS="${VALIDITY_DAYS:-10000}"

if [[ -f "$KEYSTORE" ]]; then
  echo "Keystore already exists: $KEYSTORE" >&2
  exit 1
fi

if ! command -v keytool >/dev/null 2>&1; then
  echo "Install Java JDK (keytool) first." >&2
  exit 1
fi

echo "==> Creating release keystore (you will be prompted for passwords)"
keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -dname "CN=Easy Shope Platform, OU=Mobile, O=Easy Shope, L=Cairo, C=EG"

echo ""
echo "==> GitHub Actions secrets (Settings → Secrets → Actions on easy.shope repo):"
echo ""
echo "ANDROID_KEYSTORE_BASE64 ="
base64 < "$KEYSTORE" | tr -d '\n'
echo ""
echo ""
echo "ANDROID_KEY_ALIAS = $ALIAS"
echo "ANDROID_KEYSTORE_PASSWORD = (the keystore password you entered)"
echo "ANDROID_KEY_PASSWORD = (usually same as keystore password)"
echo ""
echo "Keep $KEYSTORE offline — do NOT commit it to git."
