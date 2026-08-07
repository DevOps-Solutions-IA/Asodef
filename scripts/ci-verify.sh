#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly compose_file="$repository_root/.github/compose.ci.yml"
readonly purpose_label="prisma-clean-install-check"
artifacts_dir=""

cd "$repository_root"

fail() {
  printf 'CI verification failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

require_command curl
require_command docker
require_command node
require_command openssl
require_command pnpm
require_command setsid

[[ -f "$compose_file" ]] || fail "isolated Compose definition is missing"

# Reserve four distinct loopback ports in one process, then release them for
# the services. Doing this as a group prevents the kernel from returning the
# same ephemeral port four times and avoids collisions with a developer stack.
mapfile -t allocated_ports < <(node <<'NODE'
const net = require('node:net');
const servers = Array.from({ length: 4 }, () => net.createServer());
Promise.all(servers.map((server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen({ host: '127.0.0.1', port: 0 }, () => resolve(server.address().port));
}))).then((ports) => {
  for (const port of ports) process.stdout.write(`${port}\n`);
  return Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}).catch(() => process.exit(1));
NODE
)
[[ "${#allocated_ports[@]}" == "4" ]] || fail "could not allocate isolated loopback ports"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-asodef-ci-local-$$}"
export CI_POSTGRES_DB="${CI_POSTGRES_DB:-asodef_ci_local}"
export CI_POSTGRES_USER="${CI_POSTGRES_USER:-asodef_ci}"
export CI_POSTGRES_PORT="${CI_POSTGRES_PORT:-${allocated_ports[0]}}"
export CI_REDIS_PORT="${CI_REDIS_PORT:-${allocated_ports[1]}}"
export CI_API_PORT="${CI_API_PORT:-${allocated_ports[2]}}"
export CI_WEB_PORT="${CI_WEB_PORT:-${allocated_ports[3]}}"
export CI_POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export DATABASE_URL="postgresql://${CI_POSTGRES_USER}:${CI_POSTGRES_PASSWORD}@127.0.0.1:${CI_POSTGRES_PORT}/${CI_POSTGRES_DB}?schema=public"
export REDIS_URL="redis://127.0.0.1:${CI_REDIS_PORT}"
export API_PORT="$CI_API_PORT"
readonly api_url="http://127.0.0.1:${CI_API_PORT}"
readonly web_url="http://127.0.0.1:${CI_WEB_PORT}"
export VITE_API_URL="$api_url"
export VITE_APP_URL="$web_url"
export PUBLIC_API_URL="$api_url"
export PUBLIC_APP_URL="$web_url"
export CORS_ORIGIN="$web_url"
export BOLD_MODE="mock"
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
export PASSWORD_RESET_TOKEN_SECRET="$(openssl rand -hex 32)"
export CONTRACT_DOWNLOAD_TOKEN_SECRET="$(openssl rand -hex 32)"

[[ "$COMPOSE_PROJECT_NAME" =~ ^asodef-ci-[a-z0-9][a-z0-9_-]{7,}$ ]] || fail "COMPOSE_PROJECT_NAME must identify an isolated asodef-ci-* project"
[[ "$CI_POSTGRES_PORT" =~ ^[0-9]+$ && "$CI_REDIS_PORT" =~ ^[0-9]+$ && "$CI_API_PORT" =~ ^[0-9]+$ && "$CI_WEB_PORT" =~ ^[0-9]+$ ]] || fail "isolated service ports must be numeric"
(( CI_POSTGRES_PORT >= 1024 && CI_POSTGRES_PORT <= 65535 )) || fail "CI_POSTGRES_PORT is outside the allowed range"
(( CI_REDIS_PORT >= 1024 && CI_REDIS_PORT <= 65535 )) || fail "CI_REDIS_PORT is outside the allowed range"
(( CI_API_PORT >= 1024 && CI_API_PORT <= 65535 )) || fail "CI_API_PORT is outside the allowed range"
(( CI_WEB_PORT >= 1024 && CI_WEB_PORT <= 65535 )) || fail "CI_WEB_PORT is outside the allowed range"
[[ "$CI_POSTGRES_DB" =~ ^asodef_ci_[a-z0-9_]+$ ]] || fail "CI_POSTGRES_DB must identify an isolated asodef_ci_* database"
[[ "$CI_POSTGRES_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || fail "CI_POSTGRES_USER contains unsupported characters"
[[ "$CI_POSTGRES_PORT" != "5432" && "$CI_POSTGRES_PORT" != "5433" && "$CI_REDIS_PORT" != "6379" ]] || fail "developer service ports are forbidden"
[[ "$(printf '%s\n' "$CI_POSTGRES_PORT" "$CI_REDIS_PORT" "$CI_API_PORT" "$CI_WEB_PORT" | sort -u | wc -l)" == "4" ]] || fail "all isolated service ports must be distinct"
[[ "$CI_POSTGRES_PASSWORD" != "asodef_dev_password" ]] || fail "the developer database password is forbidden"

compose() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --file "$compose_file" "$@"
}

api_pid=""
web_pid=""
cleanup_armed=0

stop_process() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

down_isolated_services() {
  local service container_id project purpose
  for service in postgres redis; do
    container_id="$(compose ps --quiet "$service" 2>/dev/null || true)"
    [[ -n "$container_id" ]] || continue
    project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id" 2>/dev/null || true)"
    purpose="$(docker inspect --format '{{ index .Config.Labels "com.asodef.purpose" }}' "$container_id" 2>/dev/null || true)"
    [[ "$project" == "$COMPOSE_PROJECT_NAME" && "$purpose" == "$purpose_label" ]] || {
      printf 'Refusing to remove a service whose isolated-project identity changed.\n' >&2
      return 1
    }
  done
  compose down --volumes --remove-orphans >/dev/null 2>&1
}

cleanup() {
  local exit_code=$?
  trap - EXIT
  stop_process "$web_pid"
  stop_process "$api_pid"
  if [[ "$cleanup_armed" == "1" ]]; then
    down_isolated_services || exit_code=1
  fi
  if [[ "$exit_code" != "0" && -n "$artifacts_dir" ]]; then
    printf 'Last compiled API log lines:\n' >&2
    tail -n 100 "$artifacts_dir/api.log" 2>/dev/null >&2 || true
    printf 'Last frontend preview log lines:\n' >&2
    tail -n 100 "$artifacts_dir/web.log" 2>/dev/null >&2 || true
  fi
  [[ -z "$artifacts_dir" ]] || rm -rf -- "$artifacts_dir"
  exit "$exit_code"
}

if [[ -n "$(compose ps --all --quiet 2>/dev/null || true)" ]]; then
  fail "the selected isolated Compose project already exists"
fi

artifacts_dir="$(mktemp -d /tmp/asodef-ci-verify.XXXXXX)"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

port_is_available() {
  node - "$1" <<'NODE'
const net = require('node:net');
const port = Number(process.argv[2]);
const server = net.createServer();
server.once('error', () => process.exit(1));
server.listen({ host: '127.0.0.1', port }, () => server.close(() => process.exit(0)));
NODE
}

port_is_available "$CI_POSTGRES_PORT" || fail "isolated PostgreSQL port is already in use"
port_is_available "$CI_REDIS_PORT" || fail "isolated Redis port is already in use"
port_is_available "$API_PORT" || fail "API verification port is already in use"
port_is_available "$CI_WEB_PORT" || fail "frontend verification port is already in use"

wait_for_services() {
  local attempt postgres_id redis_id postgres_health redis_health
  for attempt in $(seq 1 30); do
    postgres_id="$(compose ps --quiet postgres)"
    redis_id="$(compose ps --quiet redis)"
    postgres_health="$(docker inspect --format '{{.State.Health.Status}}' "$postgres_id" 2>/dev/null || echo starting)"
    redis_health="$(docker inspect --format '{{.State.Health.Status}}' "$redis_id" 2>/dev/null || echo starting)"
    if [[ "$postgres_health" == "healthy" && "$redis_health" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  compose logs --no-color postgres redis >&2
  fail "isolated PostgreSQL/Redis did not become healthy"
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local log_file="$3"
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  tail -n 100 "$log_file" >&2 || true
  fail "$label did not become healthy"
}

printf 'CI verification: clean migration and seed contract\n'
cleanup_armed=1
compose up -d postgres redis >/dev/null
wait_for_services
scripts/ci-database-check.sh

printf 'CI verification: fresh runtime database\n'
compose up -d postgres redis >/dev/null
wait_for_services
pnpm --filter @asodef/api prisma:deploy
pnpm --filter @asodef/api prisma:seed

printf 'CI verification: source gates\n'
NODE_ENV=test pnpm ci:check

printf 'CI verification: guarded E2E state\n'
ASODEF_E2E_PREPARE=true NODE_ENV=development pnpm --filter @asodef/api ci:prepare-e2e

printf 'CI verification: compiled runtime\n'
export NODE_ENV=development
setsid node apps/api/dist/main.js >"$artifacts_dir/api.log" 2>&1 &
api_pid=$!
wait_for_url "compiled API" "$api_url/api/v1/health" "$artifacts_dir/api.log"

setsid pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port "$CI_WEB_PORT" --strictPort >"$artifacts_dir/web.log" 2>&1 &
web_pid=$!
wait_for_url "frontend preview" "$web_url/" "$artifacts_dir/web.log"

printf 'CI verification: Chromium E2E\n'
if [[ "${CI:-}" == "true" ]]; then
  pnpm exec playwright install --with-deps chromium
else
  pnpm exec playwright install chromium
fi
CI=true PLAYWRIGHT_BASE_URL="$web_url" pnpm test:e2e

printf 'CI verification passed.\n'
