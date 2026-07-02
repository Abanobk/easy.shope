#!/usr/bin/env bash
# تشغيل Easy Shope + Easy Cash محلياً على الماك (Docker Desktop فقط).
# الاستخدام:
#   ./scripts/mac-dev.sh          # تشغيل
#   ./scripts/mac-dev.sh stop     # إيقاف
#   ./scripts/mac-dev.sh status   # حالة + روابط
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:${PATH:-}"

SHOPE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CASH_DIR="${CASH_DIR:-$(dirname "$SHOPE_DIR")/easy_cash_accounting}"
SECRET="${SHOPE_INTEGRATION_SECRET:-dev-shope-cash-secret}"
SHOPE_URL="http://127.0.0.1:8098"
CASH_URL="http://127.0.0.1:8099"
CASH_INTERNAL="http://host.docker.internal:8099"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

setup_docker_compose_plugin() {
  local plugin_dir="/opt/homebrew/lib/docker/cli-plugins"
  [[ -d "$plugin_dir" ]] || return 0
  mkdir -p ~/.docker
  if [[ ! -f ~/.docker/config.json ]]; then
    cat >~/.docker/config.json <<EOF
{
  "cliPluginsExtraDirs": ["$plugin_dir"]
}
EOF
  fi
}

docker_compose() {
  setup_docker_compose_plugin
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    red "docker compose مش متاح. شغّل: ./scripts/mac-dev.sh install"
    exit 1
  fi
}

need_docker() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
    yellow "Docker موجود لكن مش شغال."
    if [[ "$(uname)" == "Darwin" ]]; then
      if [[ -d "/Applications/Docker.app" ]]; then
        yellow "→ بفتح Docker Desktop..."
        open -a Docker >/dev/null 2>&1 || true
        yellow "استنى ~30 ثانية لحد ما Docker يبقى Ready ثم شغّل السكربت تاني."
      elif command -v colima >/dev/null 2>&1; then
        yellow "→ بشغّل Colima..."
        colima start --memory 6 >/dev/null 2>&1 || colima start --memory 6
      fi
    fi
    exit 1
  fi

  red "Docker مش موجود على الماك."
  echo ""
  if command -v brew >/dev/null 2>&1; then
    yellow "عندك Homebrew — نفّذ أمر التثبيت ده (مرة واحدة):"
    echo ""
    echo "  ./scripts/mac-dev.sh install"
    echo ""
    yellow "أو يدوياً:"
    echo "  brew install colima docker docker-compose"
    echo "  colima start"
    echo "  ./scripts/mac-dev.sh"
  else
    yellow "نزّل Docker Desktop من:"
    echo "  https://www.docker.com/products/docker-desktop/"
  fi
  exit 1
}

cmd_install() {
  if ! command -v brew >/dev/null 2>&1; then
    red "Homebrew مش موجود. نزّل Docker Desktop يدوياً:"
    echo "  https://www.docker.com/products/docker-desktop/"
    exit 1
  fi
  yellow "→ تثبيت Colima + Docker (خفيف على الماك، بدون Docker Desktop)..."
  NONINTERACTIVE=1 brew install colima docker docker-compose
  setup_docker_compose_plugin
  yellow "→ تشغيل Colima (أول مرة ممكن تأخذ دقيقة)..."
  if colima status >/dev/null 2>&1; then
    colima start >/dev/null 2>&1 || colima start
  else
    colima start --cpu 4 --memory 6 --disk 40
  fi
  green "✓ Docker جاهز. شغّل الآن:"
  echo "  ./scripts/mac-dev.sh"
}

ensure_env_key() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    return 0
  fi
  printf '%s=%s\n' "$key" "$value" >>"$file"
}

prepare_env() {
  local shope_env="${SHOPE_DIR}/.env"
  local cash_env="${CASH_DIR}/.env"

  if [[ ! -d "$CASH_DIR" ]]; then
    red "مجلد Easy Cash مش موجود: $CASH_DIR"
    yellow "حط المشروع جنب easy shope أو عيّن: CASH_DIR=/path/to/easy_cash_accounting"
    exit 1
  fi

  cp -n "${SHOPE_DIR}/.env.example" "$shope_env" 2>/dev/null || true
  cp -n "${CASH_DIR}/.env.example" "$cash_env" 2>/dev/null || true

  ensure_env_key "$shope_env" SHOPE_INTEGRATION_SECRET "$SECRET"
  ensure_env_key "$cash_env" SHOPE_INTEGRATION_SECRET "$SECRET"
  ensure_env_key "$cash_env" SHOPE_API_URL "http://host.docker.internal:8098"
  ensure_env_key "$cash_env" APP_URL "$CASH_URL"
  ensure_env_key "$cash_env" APP_PORT "8099"
}

wait_health() {
  local url="$1" label="$2" max="${3:-60}"
  local i=1
  while (( i <= max )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      green "✓ $label"
      return 0
    fi
    sleep 2
    ((i++))
  done
  red "✗ $label — لم يستجب خلال $((max * 2)) ثانية"
  return 1
}

cmd_start() {
  need_docker
  prepare_env

  yellow "→ شبكة Ollama (لو Cash محتاجها)..."
  docker network create ix-ollama_default >/dev/null 2>&1 || true

  yellow "→ Easy Shope (8098)..."
  (cd "$SHOPE_DIR" && docker_compose up -d --build)
  wait_health "${SHOPE_URL}/api/health" "Easy Shope API"

  yellow "→ Easy Cash (8099)..."
  yellow "  (أول build قد يأخذ 10–15 دقيقة)"
  (cd "$CASH_DIR" && docker_compose up -d --build)
  wait_health "${CASH_URL}/api/health" "Easy Cash API"

  echo ""
  green "════════════════════════════════════════"
  green "  جاهز للتجربة على الماك"
  green "════════════════════════════════════════"
  echo ""
  echo "  Easy Shope:  $SHOPE_URL"
  echo "  Easy Cash:   $CASH_URL"
  echo ""
  echo "  سوبر أدمن Shope (افتراضي):"
  echo "    owner@easyshope.local / ChangeMe123!"
  echo ""
  echo "  ربط المحاسبة:"
  echo "    1. سجّل متجر في Shope (نفس إيميل حساب Cash)"
  echo "    2. الحساب → المحاسبة"
  echo "    3. رابط Cash: $CASH_INTERNAL"
  echo "    4. «ربط تلقائي بإيميل حسابك» → اختبار الاتصال"
  echo ""
  echo "  إيقاف: ./scripts/mac-dev.sh stop"
  echo ""

  if [[ "$(uname)" == "Darwin" ]]; then
    open "$SHOPE_URL" >/dev/null 2>&1 || true
    open "$CASH_URL" >/dev/null 2>&1 || true
  fi
}

cmd_stop() {
  need_docker
  yellow "→ إيقاف Easy Cash..."
  if [[ -d "$CASH_DIR" ]]; then
    (cd "$CASH_DIR" && docker_compose down) || true
  fi
  yellow "→ إيقاف Easy Shope..."
  (cd "$SHOPE_DIR" && docker_compose down) || true
  green "تم الإيقاف."
}

cmd_status() {
  need_docker
  echo "Easy Shope:"
  (cd "$SHOPE_DIR" && docker_compose ps) || true
  echo ""
  echo "Easy Cash:"
  if [[ -d "$CASH_DIR" ]]; then
    (cd "$CASH_DIR" && docker_compose ps) || true
  else
    red "Cash dir missing: $CASH_DIR"
  fi
  echo ""
  curl -fsS "${SHOPE_URL}/api/health" && echo " ← Shope OK" || red "Shope down"
  curl -fsS "${CASH_URL}/api/health" && echo " ← Cash OK" || red "Cash down"
}

case "${1:-start}" in
  start | up) cmd_start ;;
  stop | down) cmd_stop ;;
  status | ps) cmd_status ;;
  restart) cmd_stop; cmd_start ;;
  install | install-docker) cmd_install ;;
  *)
    echo "Usage: $0 [start|stop|status|restart|install]"
    exit 1
    ;;
esac
