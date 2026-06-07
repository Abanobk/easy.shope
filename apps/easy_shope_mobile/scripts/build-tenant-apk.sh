#!/usr/bin/env bash
# Validates tenant APK build inputs and runs flutter build with the correct native template.
set -euo pipefail

TENANT_SLUG="${TENANT_SLUG:-}"
STOREFRONT_THEME="${STOREFRONT_THEME:-ocean}"
STORE_BASE="${STORE_BASE:-}"

if [[ -z "$TENANT_SLUG" ]]; then
  echo "TENANT_SLUG is required" >&2
  exit 1
fi

if [[ -z "$STORE_BASE" ]]; then
  echo "STORE_BASE (EASY_SHOPE_API_URL) is required" >&2
  exit 1
fi

case "$STOREFRONT_THEME" in
  ocean|violet|emerald|amber|rose|slate) ;;
  *)
    echo "Unknown STOREFRONT_THEME: $STOREFRONT_THEME" >&2
    echo "Supported: ocean violet emerald amber rose slate" >&2
    exit 1
    ;;
esac

echo "==> Building native Flutter template: $STOREFRONT_THEME"
echo "==> Tenant slug: $TENANT_SLUG"
echo "==> API base: $STORE_BASE"

flutter pub get
flutter build apk --release \
  --dart-define=TENANT_SLUG="$TENANT_SLUG" \
  --dart-define=STOREFRONT_THEME="$STOREFRONT_THEME" \
  --dart-define=STOREFRONT_BASE_URL="${STORE_BASE%/}" \
  -- \
  -PTENANT_SLUG="$TENANT_SLUG" \
  -PTENANT_APP_LABEL="${TENANT_APP_LABEL:-$TENANT_SLUG}"

echo "==> APK ready: build/app/outputs/flutter-apk/app-release.apk"
