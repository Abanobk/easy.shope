#!/usr/bin/env bash
# Fetches tenant branding from the public store API and applies Android launcher icons + app label.
set -euo pipefail

TENANT_SLUG="${TENANT_SLUG:-}"
STORE_BASE="${STORE_BASE:-}"
RES_DIR="${RES_DIR:-android/app/src/main/res}"

if [[ -z "$TENANT_SLUG" || -z "$STORE_BASE" ]]; then
  echo "apply-tenant-android-branding: TENANT_SLUG and STORE_BASE required" >&2
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "apply-tenant-android-branding: jq not installed, skipping branding" >&2
  exit 0
fi

API_BASE="${STORE_BASE%/}"
STORE_JSON="$(curl -fsSL "${API_BASE}/api/store/${TENANT_SLUG}" 2>/dev/null || true)"
if [[ -z "$STORE_JSON" ]]; then
  echo "apply-tenant-android-branding: could not fetch store JSON" >&2
  exit 0
fi

APP_LABEL="$(echo "$STORE_JSON" | jq -r '.store.name_ar // .store.name_en // .store.slug // empty')"
ENV_FILE="${ENV_FILE:-/tmp/tenant-brand.env}"
if [[ -n "$APP_LABEL" ]]; then
  export TENANT_APP_LABEL="$APP_LABEL"
  printf 'TENANT_APP_LABEL=%q\n' "$APP_LABEL" > "$ENV_FILE"
  echo "==> App label: $TENANT_APP_LABEL"
fi

LOGO_URL="$(echo "$STORE_JSON" | jq -r '.store.logo_url // empty')"
if [[ -z "$LOGO_URL" ]]; then
  echo "==> No store logo — keeping default launcher icon"
  exit 0
fi

TMP_LOGO="$(mktemp /tmp/tenant-logo.XXXXXX.png)"
cleanup() { rm -f "$TMP_LOGO"; }
trap cleanup EXIT

if [[ "$LOGO_URL" == data:image/* ]]; then
  B64="${LOGO_URL#*;base64,}"
  printf '%s' "$B64" | base64 -d > "$TMP_LOGO"
elif [[ "$LOGO_URL" == http* ]]; then
  curl -fsSL "$LOGO_URL" -o "$TMP_LOGO"
else
  echo "apply-tenant-android-branding: unsupported logo_url format" >&2
  exit 0
fi

if ! command -v convert >/dev/null 2>&1 && ! command -v magick >/dev/null 2>&1; then
  echo "apply-tenant-android-branding: ImageMagick not installed, skipping icon generation" >&2
  exit 0
fi

resize_icon() {
  local size="$1"
  local out="$2"
  if command -v magick >/dev/null 2>&1; then
    magick "$TMP_LOGO" -resize "${size}x${size}" -background none -gravity center -extent "${size}x${size}" "$out"
  else
    convert "$TMP_LOGO" -resize "${size}x${size}" -background none -gravity center -extent "${size}x${size}" "$out"
  fi
}

declare -A SIZES=(
  [mipmap-mdpi]=48
  [mipmap-hdpi]=72
  [mipmap-xhdpi]=96
  [mipmap-xxhdpi]=144
  [mipmap-xxxhdpi]=192
)

for folder in "${!SIZES[@]}"; do
  size="${SIZES[$folder]}"
  dir="${RES_DIR}/${folder}"
  mkdir -p "$dir"
  resize_icon "$size" "${dir}/ic_launcher.png"
done

echo "==> Applied custom launcher icons from store logo"
