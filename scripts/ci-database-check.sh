#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly COMPOSE_FILE="$REPOSITORY_ROOT/.github/compose.ci.yml"
readonly EXPECTED_MIGRATIONS="35"
readonly PURPOSE_LABEL="prisma-clean-install-check"

cd "$REPOSITORY_ROOT"

fail() {
  printf 'CI database check failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

require_env() {
  [[ -n "${!1:-}" ]] || fail "required environment variable is missing: $1"
}

require_command docker
require_command node
require_command pnpm
require_command cmp

for variable in COMPOSE_PROJECT_NAME CI_POSTGRES_DB CI_POSTGRES_USER CI_POSTGRES_PASSWORD CI_POSTGRES_PORT CI_REDIS_PORT DATABASE_URL; do
  require_env "$variable"
done

[[ -f "$COMPOSE_FILE" ]] || fail "compose definition is missing"
[[ "$COMPOSE_PROJECT_NAME" =~ ^asodef-ci-[a-z0-9][a-z0-9_-]{7,}$ ]] || fail "COMPOSE_PROJECT_NAME must be a unique asodef-ci-* project"
[[ "$COMPOSE_PROJECT_NAME" != "asodef" ]] || fail "the developer compose project is forbidden"
[[ "$CI_POSTGRES_DB" =~ ^asodef_ci_[a-z0-9_]+$ ]] || fail "CI_POSTGRES_DB must be an isolated asodef_ci_* database"
[[ "$CI_POSTGRES_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || fail "CI_POSTGRES_USER contains unsupported characters"
[[ "$CI_POSTGRES_PORT" =~ ^[0-9]+$ ]] || fail "CI_POSTGRES_PORT must be numeric"
[[ "$CI_REDIS_PORT" =~ ^[0-9]+$ ]] || fail "CI_REDIS_PORT must be numeric"
(( CI_POSTGRES_PORT >= 1024 && CI_POSTGRES_PORT <= 65535 )) || fail "CI_POSTGRES_PORT is outside the allowed range"
(( CI_REDIS_PORT >= 1024 && CI_REDIS_PORT <= 65535 )) || fail "CI_REDIS_PORT is outside the allowed range"
[[ "$CI_POSTGRES_PORT" != "5432" && "$CI_POSTGRES_PORT" != "5433" ]] || fail "default/developer PostgreSQL ports are forbidden"
[[ "$CI_REDIS_PORT" != "6379" ]] || fail "the developer Redis port is forbidden"
[[ "$CI_POSTGRES_PORT" != "$CI_REDIS_PORT" ]] || fail "CI service ports must be distinct"
[[ "$CI_POSTGRES_PASSWORD" != "asodef_dev_password" ]] || fail "the developer database password is forbidden"

# Validate the connection target without ever rendering the URL or password.
node <<'NODE' || fail "DATABASE_URL does not target the declared isolated container"
const target = new URL(process.env.DATABASE_URL);
const expectedPort = process.env.CI_POSTGRES_PORT;
const expectedDatabase = `/${process.env.CI_POSTGRES_DB}`;
if (!['postgres:', 'postgresql:'].includes(target.protocol)) process.exit(1);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) process.exit(1);
if (target.port !== expectedPort || target.pathname !== expectedDatabase) process.exit(1);
NODE

compose() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

postgres_id="$(compose ps --quiet postgres)"
redis_id="$(compose ps --quiet redis)"
[[ -n "$postgres_id" && -n "$redis_id" ]] || fail "the isolated compose services are not running"

validate_container() {
  local container_id="$1"
  local expected_service="$2"
  local actual_project actual_service actual_purpose health
  actual_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id")"
  actual_service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_id")"
  actual_purpose="$(docker inspect --format '{{ index .Config.Labels "com.asodef.purpose" }}' "$container_id")"
  health="$(docker inspect --format '{{ .State.Health.Status }}' "$container_id")"
  [[ "$actual_project" == "$COMPOSE_PROJECT_NAME" ]] || fail "container project label does not match the authorized project"
  [[ "$actual_service" == "$expected_service" ]] || fail "container service label does not match the expected service"
  [[ "$actual_purpose" == "$PURPOSE_LABEL" ]] || fail "container purpose label is missing"
  [[ "$health" == "healthy" ]] || fail "$expected_service is not healthy"
}

validate_container "$postgres_id" postgres
validate_container "$redis_id" redis

[[ "$(docker port "$postgres_id" 5432/tcp)" == "127.0.0.1:${CI_POSTGRES_PORT}" ]] || fail "PostgreSQL is not bound to the declared isolated host port"
[[ "$(docker port "$redis_id" 6379/tcp)" == "127.0.0.1:${CI_REDIS_PORT}" ]] || fail "Redis is not bound to the declared isolated host port"

cleanup_armed=1
work_files=()

cleanup() {
  local exit_code=$?
  trap - EXIT
  for file in "${work_files[@]:-}"; do
    [[ -n "$file" && -f "$file" ]] && rm -f -- "$file"
  done
  if [[ "${cleanup_armed:-0}" == "1" ]]; then
    local id project purpose
    for id in "$(compose ps --quiet postgres)" "$(compose ps --quiet redis)"; do
      [[ -n "$id" ]] || continue
      project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$id" 2>/dev/null || true)"
      purpose="$(docker inspect --format '{{ index .Config.Labels "com.asodef.purpose" }}' "$id" 2>/dev/null || true)"
      if [[ "$project" != "$COMPOSE_PROJECT_NAME" || "$purpose" != "$PURPOSE_LABEL" ]]; then
        printf 'Refusing cleanup: isolated project identity changed.\n' >&2
        exit 1
      fi
    done
    compose down --volumes --remove-orphans >/dev/null 2>&1 || {
      printf 'Failed to clean up the isolated compose project.\n' >&2
      exit 1
    }
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

db_scalar() {
  compose exec --no-TTY postgres psql \
    --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --username "$CI_POSTGRES_USER" --dbname "$CI_POSTGRES_DB" \
    --command "$1"
}

# This check must begin with a truly empty database. It intentionally refuses
# an existing developer/test schema rather than attempting any reset.
preexisting_relations="$(db_scalar "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');")"
[[ "$preexisting_relations" == "0" ]] || fail "the target database is not empty; no reset was attempted"

run_quiet() {
  local label="$1"
  shift
  local log_file
  log_file="$(mktemp -t asodef-ci-db-check.XXXXXX)"
  work_files+=("$log_file")
  if ! "$@" >"$log_file" 2>&1; then
    printf 'Sanitized command diagnostics (last 120 lines):\n' >&2
    node - "$log_file" <<'NODE' >&2
const fs = require('node:fs');

const logPath = process.argv[2];
let output = fs.readFileSync(logPath, 'utf8');
const sensitiveVariables = [
  'DATABASE_URL',
  'CI_POSTGRES_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
  'PASSWORD_RESET_TOKEN_SECRET',
  'CONTRACT_DOWNLOAD_TOKEN_SECRET',
];

for (const variable of sensitiveVariables) {
  const value = process.env[variable];
  if (value && value.length >= 4) output = output.split(value).join('[REDACTED]');
}

output = output.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[REDACTED_DATABASE_URL]');
const lines = output.trimEnd().split(/\r?\n/u).slice(-120);
process.stderr.write(`${lines.join('\n')}\n`);
NODE
    fail "$label"
  fi
}

run_quiet "Prisma client generation failed" pnpm --filter @asodef/api prisma:generate
run_quiet "Prisma schema validation failed" pnpm --filter @asodef/api exec prisma validate --schema prisma/schema.prisma
run_quiet "Prisma migration deployment failed" pnpm --filter @asodef/api prisma:deploy
run_quiet "Prisma migration status failed" pnpm --filter @asodef/api exec prisma migrate status --schema prisma/schema.prisma

finished_migrations="$(db_scalar "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
total_migrations="$(db_scalar "SELECT count(*) FROM _prisma_migrations;")"
unfinished_migrations="$(db_scalar "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;")"
[[ "$finished_migrations" == "$EXPECTED_MIGRATIONS" ]] || fail "expected $EXPECTED_MIGRATIONS finished migrations"
[[ "$total_migrations" == "$EXPECTED_MIGRATIONS" ]] || fail "migration history contains an unexpected number of rows"
[[ "$unfinished_migrations" == "0" ]] || fail "migration history contains failed or rolled-back rows"

expected_indexes="$(db_scalar "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('self_service_sessions_token_hash_key','self_service_idempotency_session_id_operation_key_key','payment_orders_public_reference_key','payment_events_idempotency_key_key','data_subject_requests_public_reference_key','pqr_cases_case_number_key','affiliate_external_identities_active_affiliate_issuer_key','affiliate_external_identity_fingerprints_issuer_key_id_subject_ref_hash_key','affiliate_external_identity_fingerprints_identity_id_key_id_key');")"
expected_constraints="$(db_scalar "SELECT count(*) FROM pg_constraint WHERE conname IN ('self_service_sessions_challenge_id_fkey','self_service_otp_challenges_access_lookup_id_fkey','self_service_idempotency_session_id_fkey','self_service_contact_updates_session_id_fkey','affiliate_external_identities_affiliate_id_fkey','affiliate_external_identities_replaced_by_identity_id_fkey','affiliate_external_identity_fingerprints_identity_id_issuer_fkey');")"
expected_tables="$(db_scalar "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('self_service_access_lookups','self_service_otp_challenges','self_service_sessions','self_service_idempotency','self_service_contact_updates','self_service_audit_events','affiliate_external_identities','affiliate_external_identity_fingerprints','pqr_cases','data_subject_requests','payment_events','payment_orders');")"
[[ "$expected_indexes" == "9" ]] || fail "one or more required unique indexes are missing"
[[ "$expected_constraints" == "7" ]] || fail "one or more identity/self-service foreign keys are missing"
[[ "$expected_tables" == "12" ]] || fail "one or more representative tables are missing"

snapshot_sql=$(cat <<'SQL'
SELECT 'roles=' || count(*) FROM roles
UNION ALL SELECT 'permissions=' || count(*) FROM permissions
UNION ALL SELECT 'role_permissions=' || count(*) FROM role_permissions
UNION ALL SELECT 'content_entries=' || count(*) FROM content_entries
UNION ALL SELECT 'legal_documents=' || count(*) FROM legal_documents
UNION ALL SELECT 'legal_versions=' || count(*) FROM legal_document_versions
UNION ALL SELECT 'consent_purposes=' || count(*) FROM consent_purposes
UNION ALL SELECT 'retention_policies=' || count(*) FROM retention_policies
UNION ALL SELECT 'approval_gates=' || count(*) FROM approval_gates
UNION ALL SELECT 'communication_templates=' || count(*) FROM communication_templates
UNION ALL SELECT 'demo_plans=' || count(*) FROM plans WHERE name='Plan Demo'
UNION ALL SELECT 'demo_plan_versions=' || count(*) FROM plan_versions pv JOIN plans p ON p.id=pv.plan_id WHERE p.name='Plan Demo' AND pv.version=1
UNION ALL SELECT 'demo_customers=' || count(*) FROM customers WHERE document_number IN ('1000000001','1000000002')
UNION ALL SELECT 'demo_obligations=' || count(*) FROM obligations WHERE concept IN ('Cuota de prueba - Cliente Demo Uno','Cuota de prueba - Cliente Demo Dos')
ORDER BY 1;
SQL
)

natural_key_duplicate_sql=$(cat <<'SQL'
SELECT
  (SELECT count(*) FROM (SELECT name FROM roles GROUP BY name HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT key FROM permissions GROUP BY key HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT key FROM content_entries GROUP BY key HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT slug FROM legal_documents GROUP BY slug HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT key FROM consent_purposes GROUP BY key HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT record_category FROM retention_policies GROUP BY record_category HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT key FROM approval_gates GROUP BY key HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT key FROM communication_templates GROUP BY key HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT customer_id, concept FROM obligations GROUP BY customer_id, concept HAVING count(*) > 1) d);
SQL
)

baseline_snapshot=""
for seed_run in 1 2 3; do
  run_quiet "seed run $seed_run failed" pnpm --filter @asodef/api prisma:seed
  snapshot_file="$(mktemp -t asodef-ci-seed-${seed_run}.XXXXXX)"
  work_files+=("$snapshot_file")
  db_scalar "$snapshot_sql" >"$snapshot_file"
  if [[ -z "$baseline_snapshot" ]]; then
    baseline_snapshot="$snapshot_file"
  else
    cmp --silent "$baseline_snapshot" "$snapshot_file" || fail "seed run $seed_run changed stable row counts"
  fi
  [[ "$(db_scalar "$natural_key_duplicate_sql")" == "0" ]] || fail "seed run $seed_run created a duplicate natural key"
done

[[ "$(db_scalar "SELECT count(*) FROM roles;")" == "9" ]] || fail "seeded role count is not 9"
[[ "$(db_scalar "SELECT count(*) FROM permissions;")" == "45" ]] || fail "seeded permission count is not 45"
[[ "$(db_scalar "SELECT count(*) FROM content_entries;")" == "38" ]] || fail "seeded content count is not 38"
[[ "$(db_scalar "SELECT count(*) FROM legal_documents;")" == "21" ]] || fail "legal seed must create exactly 21 documents"
[[ "$(db_scalar "SELECT count(*) FROM legal_document_versions WHERE version=1 AND status='DRAFT';")" == "21" ]] || fail "legal seed must create 21 version-1 DRAFT records"
[[ "$(db_scalar "SELECT count(*) FROM legal_document_versions WHERE version<>1 OR status<>'DRAFT';")" == "0" ]] || fail "clean legal seed performed an unauthorized workflow transition"
[[ "$(db_scalar "SELECT count(*) FROM legal_documents WHERE current_version_id IS NOT NULL OR slug LIKE 'consent-test-doc-%';")" == "0" ]] || fail "clean legal seed created a current/synthetic legal document"
[[ "$(db_scalar "SELECT count(*) FROM users;")" == "0" ]] || fail "clean seed must not create users"
[[ "$(db_scalar "SELECT (SELECT count(*) FROM self_service_access_lookups) + (SELECT count(*) FROM self_service_otp_challenges) + (SELECT count(*) FROM self_service_sessions) + (SELECT count(*) FROM self_service_idempotency) + (SELECT count(*) FROM self_service_contact_updates) + (SELECT count(*) FROM self_service_audit_events) + (SELECT count(*) FROM affiliate_external_identities) + (SELECT count(*) FROM affiliate_external_identity_fingerprints);")" == "0" ]] || fail "clean seed must not create self-service identity/session data"

printf 'CI database check passed: %s migrations; three stable seed runs; isolated project verified.\n' "$EXPECTED_MIGRATIONS"
