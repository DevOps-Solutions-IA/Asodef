#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly migrations_root="$repository_root/apps/api/prisma/migrations"
readonly bingo_migration="20260809180000_add_bingo_domain"
readonly stage5_fairness_snapshot_migration="20260811120000_add_bingo_execution_fairness_snapshot"
readonly stage5_prize_pattern_migration="20260811130000_link_bingo_prizes_to_patterns"
readonly stage5_pattern_mask_guard_migration="20260811230000_guard_bingo_execution_pattern_masks"
readonly baseline_migration_count="35"
readonly expected_migration_count="39"
readonly upgrade_database="${CI_POSTGRES_DB}_bingo_upgrade"

[[ "$upgrade_database" =~ ^asodef_ci_[a-z0-9_]+$ ]] || {
  printf 'Unsafe Bingo upgrade database name.\n' >&2
  exit 1
}

readonly temporary_prisma="$(mktemp -d -t asodef-bingo-upgrade.XXXXXX)"
upgrade_created=0

compose() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --file "$repository_root/.github/compose.ci.yml" "$@"
}

admin_sql() {
  compose exec --no-TTY postgres psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$CI_POSTGRES_USER" --dbname postgres --command "$1" >/dev/null
}

upgrade_scalar() {
  compose exec --no-TTY postgres psql --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --username "$CI_POSTGRES_USER" --dbname "$upgrade_database" --command "$1"
}

cleanup() {
  local exit_code=$?
  trap - EXIT
  rm -rf -- "$temporary_prisma"
  if [[ "$upgrade_created" == "1" ]]; then
    admin_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$upgrade_database' AND pid <> pg_backend_pid();" || exit_code=1
    admin_sql "DROP DATABASE \"$upgrade_database\";" || exit_code=1
  fi
  exit "$exit_code"
}
trap cleanup EXIT

admin_sql "CREATE DATABASE \"$upgrade_database\";"
upgrade_created=1

mkdir -p "$temporary_prisma/migrations"
cp "$repository_root/apps/api/prisma/schema.prisma" "$temporary_prisma/schema.prisma"
cp "$migrations_root/migration_lock.toml" "$temporary_prisma/migrations/migration_lock.toml"

copied=0
for migration in "$migrations_root"/*; do
  [[ -d "$migration" ]] || continue
  case "$(basename "$migration")" in
    "$bingo_migration"|"$stage5_fairness_snapshot_migration"|"$stage5_prize_pattern_migration"|"$stage5_pattern_mask_guard_migration") continue ;;
  esac
  cp -R "$migration" "$temporary_prisma/migrations/"
  copied=$((copied + 1))
done
[[ "$copied" == "$baseline_migration_count" ]] || {
  printf 'Expected %s pre-Bingo migrations, copied %s.\n' "$baseline_migration_count" "$copied" >&2
  exit 1
}

upgrade_url="$(node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname=`/${process.argv[1]}`; process.stdout.write(u.toString())' "$upgrade_database")"
DATABASE_URL="$upgrade_url" pnpm --filter @asodef/api exec prisma migrate deploy --schema "$temporary_prisma/schema.prisma" >/dev/null

upgrade_scalar "
  INSERT INTO users (id,email,password_hash,full_name,updated_at) VALUES
    ('10000000-0000-4000-8000-000000000001','bingo-upgrade-canary@example.com','canary','Upgrade Canary',CURRENT_TIMESTAMP);
  INSERT INTO customers (id,document_type,document_number,full_name,email,phone) VALUES
    ('10000000-0000-4000-8000-000000000002','CC','bingo-upgrade-canary','Upgrade Customer','upgrade-customer@example.com','3000000000');
  INSERT INTO affiliates (id,customer_id,affiliate_number) VALUES
    ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','BINGO-UPGRADE-CANARY');
  INSERT INTO companies (id,name,nit,contact_name,contact_email,sector) VALUES
    ('10000000-0000-4000-8000-000000000004','Bingo Upgrade Company','BINGO-UPGRADE-NIT','Upgrade Contact','upgrade-company@example.com','TEST');
" >/dev/null

DATABASE_URL="$upgrade_url" pnpm --filter @asodef/api exec prisma migrate deploy --schema prisma/schema.prisma >/dev/null

[[ "$(upgrade_scalar "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")" == "$expected_migration_count" ]]
[[ "$(upgrade_scalar "SELECT (SELECT count(*) FROM users WHERE id='10000000-0000-4000-8000-000000000001') + (SELECT count(*) FROM customers WHERE id='10000000-0000-4000-8000-000000000002') + (SELECT count(*) FROM affiliates WHERE id='10000000-0000-4000-8000-000000000003') + (SELECT count(*) FROM companies WHERE id='10000000-0000-4000-8000-000000000004');")" == "4" ]]
[[ "$(upgrade_scalar "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('bingo_events','bingo_round_executions','bingo_draws','bingo_winners');")" == "4" ]]

printf 'Bingo upgrade-from-main canary passed: %s existing migrations plus the additive Bingo migrations (%s total).\n' \
  "$baseline_migration_count" "$expected_migration_count"
