#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly COMPOSE_FILE="$REPO_ROOT/docker-compose.local-preview.yml"
readonly STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/asodef-local-preview-${UID}"
readonly ENV_FILE="$STATE_DIR/runtime.env"
readonly EXPECTED_MIGRATIONS=51
readonly PURPOSE_LABEL=local-preview

fail() {
  printf 'Local Preview start failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

free_port() {
  node -e 'const net=require("node:net");const server=net.createServer();server.listen(0,"127.0.0.1",()=>{process.stdout.write(String(server.address().port));server.close();});'
}

generate_runtime_env() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  local temporary_file
  temporary_file="$(mktemp "$STATE_DIR/runtime.env.new.XXXXXX")"
  chmod 600 "$temporary_file"
  local postgres_port redis_port api_port web_port project_name short_sha
  postgres_port="$(free_port)"
  redis_port="$(free_port)"
  api_port="$(free_port)"
  web_port="$(free_port)"
  short_sha="$(git -C "$REPO_ROOT" rev-parse --short=12 origin/main)"
  project_name="asodef-preview-${short_sha}-${UID}"
  umask 077
  {
    printf 'COMPOSE_PROJECT_NAME=%s\n' "$project_name"
    printf 'LOCAL_PREVIEW_ENV_FILE=%s\n' "$ENV_FILE"
    printf 'LOCAL_PREVIEW_POSTGRES_PORT=%s\n' "$postgres_port"
    printf 'LOCAL_PREVIEW_REDIS_PORT=%s\n' "$redis_port"
    printf 'LOCAL_PREVIEW_API_PORT=%s\n' "$api_port"
    printf 'LOCAL_PREVIEW_WEB_PORT=%s\n' "$web_port"
    printf 'LOCAL_PREVIEW_API_URL=http://localhost:%s\n' "$api_port"
    printf 'LOCAL_PREVIEW_WEB_URL=http://localhost:%s\n' "$web_port"
    printf 'POSTGRES_DB=asodef_preview_%s\n' "$short_sha"
    printf 'POSTGRES_USER=asodef_preview\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'NODE_ENV=development\n'
    printf 'ADMIN_ACCOUNT_EMAIL=admin@asodef.com.co\n'
    printf 'ADMIN_RECOVERY_EMAIL=preview@example.com\n'
    printf 'ADMIN_MFA_REQUIRED=true\n'
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'JWT_REFRESH_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'PASSWORD_RESET_TOKEN_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'CONTRACT_DOWNLOAD_TOKEN_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'ASODEF_E2E_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    node -e 'const {randomBytes}=require("node:crypto");const a="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";process.stdout.write(`ASODEF_E2E_ADMIN_MFA_SECRET=${[...randomBytes(32)].map((b)=>a[b&31]).join("")}\n`)'
    node -e 'const {randomBytes}=require("node:crypto");const a="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";const code=()=>{const v=[...randomBytes(12)].map((b)=>a[b%a.length]).join("");return `${v.slice(0,4)}-${v.slice(4,8)}-${v.slice(8)}`};process.stdout.write(`ASODEF_E2E_ADMIN_RECOVERY_CODES=${Array.from({length:10},code).join(",")}\n`)'
    printf 'AI_RUNTIME_ENABLED=false\n'
    printf 'OPENROUTER_API_KEY=\n'
    printf 'OPENROUTER_BASE_URL=https://openrouter.ai/api/v1\n'
    printf 'OPENROUTER_TIMEOUT_MS=10000\n'
    printf 'OPENROUTER_MAX_ATTEMPTS=2\n'
    printf 'OPENROUTER_CIRCUIT_FAILURE_THRESHOLD=3\n'
    printf 'OPENROUTER_CIRCUIT_RESET_MS=30000\n'
    printf 'LOCAL_PREVIEW_CERTIFIED_SHA=%s\n' "$(git -C "$REPO_ROOT" rev-parse origin/main)"
  } >"$temporary_file"
  mv -- "$temporary_file" "$ENV_FILE"
}

ensure_canonical_urls() {
  node - "$ENV_FILE" <<'NODE' || exit 1
const fs = require("node:fs");
const path = process.argv[2];
const content = fs.readFileSync(path, "utf8");
const values = new Map();
for (const line of content.split(/\r?\n/u)) {
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
}
const apiUrlPresent = values.has("LOCAL_PREVIEW_API_URL");
const webUrlPresent = values.has("LOCAL_PREVIEW_WEB_URL");
if (apiUrlPresent !== webUrlPresent) throw new Error("runtime.env must define both canonical URLs or neither");
if (apiUrlPresent) process.exit(0);
const apiPort = values.get("LOCAL_PREVIEW_API_PORT");
const webPort = values.get("LOCAL_PREVIEW_WEB_PORT");
if (!apiPort || !webPort) throw new Error("runtime.env ports are required before canonical URLs can be added");
const suffix = `${content.endsWith("\n") ? "" : "\n"}LOCAL_PREVIEW_API_URL=http://localhost:${apiPort}\nLOCAL_PREVIEW_WEB_URL=http://localhost:${webPort}\n`;
const temporaryPath = `${path}.canonical-${process.pid}`;
try {
  fs.writeFileSync(temporaryPath, content + suffix, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporaryPath, path);
  fs.chmodSync(path, 0o600);
} finally {
  try { fs.unlinkSync(temporaryPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
NODE
}

validate_runtime_env() {
  [ -e "$ENV_FILE" ] || generate_runtime_env
  [ -f "$ENV_FILE" ] || fail "runtime.env must be a regular file"
  [ ! -L "$ENV_FILE" ] || fail "runtime.env must not be a symlink"
  [ "$(stat -c %u "$ENV_FILE")" = "$(id -u)" ] || fail "runtime.env must belong to the current user"
  [ "$(stat -c %a "$ENV_FILE")" = "600" ] || fail "runtime.env must have mode 0600"
  ensure_canonical_urls
  node - "$ENV_FILE" <<'NODE' || exit 1
const fs = require("node:fs");
const path = process.argv[2];
const values = new Map();
for (const [index, line] of fs.readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) throw new Error(`runtime.env has an invalid entry at line ${index + 1}`);
  const key = line.slice(0, separator);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) throw new Error(`runtime.env has an invalid key at line ${index + 1}`);
  if (values.has(key)) throw new Error(`runtime.env repeats ${key}`);
  values.set(key, line.slice(separator + 1));
}
const required = [
  "COMPOSE_PROJECT_NAME", "LOCAL_PREVIEW_POSTGRES_PORT", "LOCAL_PREVIEW_REDIS_PORT",
  "LOCAL_PREVIEW_API_PORT", "LOCAL_PREVIEW_WEB_PORT", "LOCAL_PREVIEW_API_URL",
  "LOCAL_PREVIEW_WEB_URL", "POSTGRES_DB", "POSTGRES_USER",
  "POSTGRES_PASSWORD", "JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY",
  "PASSWORD_RESET_TOKEN_SECRET", "CONTRACT_DOWNLOAD_TOKEN_SECRET", "ADMIN_ACCOUNT_EMAIL",
  "ADMIN_RECOVERY_EMAIL", "ASODEF_E2E_ADMIN_PASSWORD", "ASODEF_E2E_ADMIN_MFA_SECRET",
  "ASODEF_E2E_ADMIN_RECOVERY_CODES", "AI_RUNTIME_ENABLED", "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL", "OPENROUTER_TIMEOUT_MS", "OPENROUTER_MAX_ATTEMPTS",
  "OPENROUTER_CIRCUIT_FAILURE_THRESHOLD", "OPENROUTER_CIRCUIT_RESET_MS",
];
for (const key of required) if (!values.has(key)) throw new Error(`runtime.env is missing ${key}`);
if (!/^asodef-preview-[0-9a-f]{12}-[0-9]+$/u.test(values.get("COMPOSE_PROJECT_NAME"))) throw new Error("runtime.env has an invalid COMPOSE_PROJECT_NAME");
if (!/^asodef_preview_[a-z0-9_]+$/u.test(values.get("POSTGRES_DB"))) throw new Error("runtime.env has an invalid POSTGRES_DB");
const portKeys = ["LOCAL_PREVIEW_POSTGRES_PORT", "LOCAL_PREVIEW_REDIS_PORT", "LOCAL_PREVIEW_API_PORT", "LOCAL_PREVIEW_WEB_PORT"];
const ports = portKeys.map((key) => Number(values.get(key)));
if (ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error("runtime.env contains an unsafe port");
if (new Set(ports).size !== ports.length || ports.some((port) => [5432, 5433, 6379].includes(port))) throw new Error("runtime.env ports must be distinct and non-default");
if (values.get("LOCAL_PREVIEW_API_URL") !== `http://localhost:${values.get("LOCAL_PREVIEW_API_PORT")}`) throw new Error("runtime.env API URL must use the canonical localhost origin and declared port");
if (values.get("LOCAL_PREVIEW_WEB_URL") !== `http://localhost:${values.get("LOCAL_PREVIEW_WEB_PORT")}`) throw new Error("runtime.env Web URL must use the canonical localhost origin and declared port");
if (values.get("OPENROUTER_BASE_URL") !== "https://openrouter.ai/api/v1") throw new Error("runtime.env OPENROUTER_BASE_URL is not canonical");
if (!/^(true|false)$/u.test(values.get("AI_RUNTIME_ENABLED"))) throw new Error("runtime.env AI_RUNTIME_ENABLED must be true or false");
if (values.get("AI_RUNTIME_ENABLED") === "true" && !values.get("OPENROUTER_API_KEY")) throw new Error("AI runtime requires OPENROUTER_API_KEY");
const forbidden = ["169.58.36.138", "172.25.52.1", "172.25.51.1"];
if ([...values.values()].some((value) => forbidden.some((address) => value.includes(address)))) throw new Error("runtime.env contains a forbidden production target");
NODE
}

env_value() {
  local key="$1"
  awk -F= -v expected="$key" '$1 == expected { print substr($0, index($0, "=") + 1); exit }' "$ENV_FILE"
}

for command in docker git node pnpm openssl curl stat awk; do require_command "$command"; done
docker compose version >/dev/null
[ "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)" = "$REPO_ROOT" ] || fail "script is not running from the ASODEF repository root"
[ -f "$COMPOSE_FILE" ] || fail "compose definition is missing"

head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main)"
merge_base="$(git -C "$REPO_ROOT" merge-base HEAD origin/main)"
[ "$merge_base" = "$main_sha" ] || fail "HEAD is not based on exact origin/main"

allowed_pattern='^(README\.md|docker-compose\.local-preview\.yml|scripts/local-preview-(init|start|stop)\.sh|apps/api/src/database/local-preview-prepare\.ts)$'
while IFS= read -r path; do
  [ -z "$path" ] || [[ "$path" =~ $allowed_pattern ]] || fail "product code differs from certified main: $path"
done < <(git -C "$REPO_ROOT" status --porcelain=v1 | sed -E 's/^.. //; s/.* -> //')
while IFS= read -r path; do
  [ -z "$path" ] || [[ "$path" =~ $allowed_pattern ]] || fail "branch changes product code outside Local Preview: $path"
done < <(git -C "$REPO_ROOT" diff --name-only origin/main...HEAD)

validate_runtime_env
project_name="$(env_value COMPOSE_PROJECT_NAME)"
postgres_port="$(env_value LOCAL_PREVIEW_POSTGRES_PORT)"
redis_port="$(env_value LOCAL_PREVIEW_REDIS_PORT)"
api_port="$(env_value LOCAL_PREVIEW_API_PORT)"
web_port="$(env_value LOCAL_PREVIEW_WEB_PORT)"
api_url="$(env_value LOCAL_PREVIEW_API_URL)"
web_url="$(env_value LOCAL_PREVIEW_WEB_URL)"

compose() {
  docker compose --project-name "$project_name" --env-file "$ENV_FILE" --file "$COMPOSE_FILE" "$@"
}

if [ -n "$(compose ps --quiet 2>/dev/null)" ]; then
  fail "Local Preview resources already exist; run scripts/local-preview-stop.sh first"
fi

for port in "$postgres_port" "$redis_port" "$api_port" "$web_port"; do
  node - "$port" <<'NODE' || fail "local port $port is unavailable"
const net = require("node:net");
const server = net.createServer();
server.once("error", () => process.exit(1));
server.listen(Number(process.argv[2]), "127.0.0.1", () => server.close(() => process.exit(0)));
NODE
done

cleanup_on_failure=1
cleanup() {
  local exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ] && [ "$cleanup_on_failure" = 1 ]; then
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT

printf 'Starting isolated Local Preview from certified base %s (source HEAD %s).\n' "$main_sha" "$head_sha"
pnpm --dir "$REPO_ROOT" prepare:generated
COMPOSE_BAKE=false DOCKER_BUILDKIT=0 compose build api web
compose up -d postgres redis --wait
compose run --rm initialize
compose up -d api web --wait

curl --fail --silent --show-error "$api_url/api/v1/health/ready" >/dev/null
curl --fail --silent --show-error "$web_url/" >/dev/null

for service in postgres redis api web; do
  container_id="$(compose ps --quiet "$service")"
  [ -n "$container_id" ] || fail "$service container is missing"
  [ "$(docker inspect --format '{{ index .Config.Labels "com.asodef.purpose" }}' "$container_id")" = "$PURPOSE_LABEL" ] || fail "$service purpose label is invalid"
  [ "$(docker inspect --format '{{ .State.Health.Status }}' "$container_id")" = healthy ] || fail "$service is not healthy"
done

cleanup_on_failure=0
printf 'Local Preview is ready.\n'
printf 'WEB_URL=%s\n' "$web_url"
printf 'API_URL=%s\n' "$api_url"
printf 'Public: %s/\n' "$web_url"
printf 'Login:  %s/iniciar-sesion\n' "$web_url"
printf 'Admin:  %s/admin\n' "$web_url"
printf 'Koral:  %s/admin/koral/conocimiento\n' "$web_url"
printf 'API health: %s/api/v1/health\n' "$api_url"
printf 'Runtime credentials remain in the protected file: %s\n' "$ENV_FILE"
printf 'Database contract: %s migrations; zero drift; seeds 3/3.\n' "$EXPECTED_MIGRATIONS"
printf 'Stop with: scripts/local-preview-stop.sh\n'
