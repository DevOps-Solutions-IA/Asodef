#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
cd "$repo_root"
expected_migrations=$(find "$repo_root/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
[[ "$expected_migrations" =~ ^[1-9][0-9]*$ ]] || {
  echo 'status=error code=PRODUCTION_MIGRATION_COUNT_INVALID' >&2
  exit 1
}
grep -Fq "readonly EXPECTED_MIGRATIONS=$expected_migrations" "$script_dir/deploy-public-platform.sh" || {
  echo "status=error code=PRODUCTION_MIGRATION_CONTRACT_STALE expected=$expected_migrations" >&2
  exit 1
}
export FAKE_EXPECTED_MIGRATION_COUNT="$expected_migrations"
for script in "$script_dir"/*.sh "$repo_root/ops/admin-core/rollback-public-admin-core.sh"; do bash -n "$script"; done
for python_source in "$script_dir"/*.py; do
  python3 -c 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")' "$python_source"
done
python3 -m unittest -v \
  ops.production.test_provision_ai_runtime \
  ops.production.test_provision_stack_env \
  ops.production.test_release_publication \
  ops.production.test_privileged_channel

runtime=$(mktemp -d)
trap 'rm -rf "$runtime"' EXIT
source_sha=0000000000000000000000000000000000000000
api_image_id=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
web_image_id=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
previous_api_image_id=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
previous_web_image_id=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
cp "$script_dir/tests/docker-compose.production.yml" "$runtime/docker-compose.production.yml"
cp "$script_dir/tests/docker-compose.master-tunnel.yml" "$runtime/docker-compose.master-tunnel.yml"
cp "$script_dir/tests/stack.env" "$runtime/.stack.env"
cp "$repo_root/ops/mail-platform/docker-compose.mail-platform.yml" "$runtime/docker-compose.mail-platform.yml"
cp "$repo_root/ops/admin-core/docker-compose.admin-core.yml" "$runtime/docker-compose.admin-core.yml"
printf '%s\n' \
  'AI_RUNTIME_ENABLED=true' \
  'OPENROUTER_API_KEY=synthetic-openrouter-credential-for-compose-test' \
  'OPENROUTER_BASE_URL=https://openrouter.ai/api/v1' >"$runtime/.env.production"
chmod 0600 "$runtime/.env.production"
sed \
  -e 's#@@API_IMAGE@@#asodef-public-platform-api:0000000000000000000000000000000000000000#' \
  -e 's#@@WEB_IMAGE@@#asodef-public-platform-web:0000000000000000000000000000000000000000#' \
  -e 's#@@APP_ENV_FILE@@#'"$runtime/.env.production"'#' \
  "$script_dir/docker-compose.release.yml.template" >"$runtime/docker-compose.release.yml"

install_runtime="$runtime/install-test"
mkdir "$install_runtime"
cp "$script_dir/tests/docker-compose.production.yml" "$install_runtime/docker-compose.production.yml"
cp "$script_dir/tests/docker-compose.master-tunnel.yml" "$install_runtime/docker-compose.master-tunnel.yml"
cp "$script_dir/tests/stack.env" "$install_runtime/.stack.env"
chmod 0600 "$install_runtime/.stack.env"
cp "$runtime/.env.production" "$install_runtime/.env.production"
chmod 0600 "$install_runtime/.env.production"
ASODEF_COMPOSE_CONTRACT_TEST_MODE=true "$script_dir/install-compose-contract.sh" \
  --shared-dir "$install_runtime" \
  --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
  --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 >/dev/null
[[ ! -e "$install_runtime/docker-compose.mail-platform.yml" ]] || {
  echo 'status=error code=DRY_RUN_MUTATED_SHARED_CONTRACT' >&2; exit 1;
}

docker compose \
  --project-name asodef-public-platform-production \
  --env-file "$runtime/.stack.env" \
  --file "$runtime/docker-compose.production.yml" \
  --file "$runtime/docker-compose.master-tunnel.yml" \
  --file "$runtime/docker-compose.mail-platform.yml" \
  --file "$runtime/docker-compose.admin-core.yml" \
  --file "$runtime/docker-compose.release.yml" \
  config --format json | python3 "$script_dir/test-compose-contract.py"

# shellcheck disable=SC2016
grep -Fq -- '--env-file "$ASODEF_STACK_ENV"' "$script_dir/compose-contract.sh"
for compose in ASODEF_BASE_COMPOSE ASODEF_MASTER_COMPOSE ASODEF_MAIL_COMPOSE ASODEF_ADMIN_COMPOSE ASODEF_RELEASE_COMPOSE; do
  grep -Fq -- "--file \"\$$compose\"" "$script_dir/compose-contract.sh"
done
grep -Fq 'production_compose up -d --no-deps --force-recreate api web' "$script_dir/deploy-public-platform.sh"
grep -Fq -- '--network asodef_public_platform_data' "$script_dir/deploy-public-platform.sh"
grep -Fq 'node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma' "$script_dir/deploy-public-platform.sh"
grep -Fq 'node_modules/.bin/prisma migrate status --schema prisma/schema.prisma' "$script_dir/deploy-public-platform.sh"
if grep -Eq 'pnpm|corepack' "$script_dir/deploy-public-platform.sh"; then
  echo 'status=error code=PRODUCTION_MIGRATION_REQUIRES_PACKAGE_MANAGER' >&2
  exit 1
fi
# shellcheck disable=SC2016
grep -Fq 'load_production_compose_contract "$shared_dir"' "$repo_root/ops/admin-core/rollback-public-admin-core.sh"
if find "$script_dir" -type f ! -name 'test-artifacts.sh' -print0 \
  | xargs -0 grep -IEq 'docker compose[^\n]* down|permit_mynetworks|0\.0\.0\.0:587|\[::\]:587'; then
  echo 'status=error code=UNSAFE_PRODUCTION_COMPOSE_PATTERN' >&2
  exit 1
fi

grep -Fq 'production_compose' "$repo_root/ops/admin-core/rollback-public-admin-core.sh"
if grep -Fq -- '--compose' "$repo_root/ops/admin-core/rollback-public-admin-core.sh"; then
  echo 'status=error code=ROLLBACK_ACCEPTS_INCOMPLETE_COMPOSE_LIST' >&2
  exit 1
fi

fake_bin="$runtime/fake-bin"
mkdir "$fake_bin"
cat >"$fake_bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ "${1:-}" == run && "$*" == *'--network none'* && "$*" == *'find prisma/migrations'* ]]; then
  printf '%s\n' "${FAKE_MIGRATION_COUNT:-$FAKE_EXPECTED_MIGRATION_COUNT}"
  exit 0
fi
if [[ "${1:-}" == run && "$*" == *'--network asodef_public_platform_data'* && "${FAKE_MIGRATION_FAIL:-false}" == true ]]; then
  exit 1
fi
if [[ "${1:-}" == image && "${2:-}" == inspect && "$*" == *'--format'* ]]; then
  image=${*: -1}
  if [[ -z "${FAKE_SOURCE_SHA:-}" && "$*" == *'org.opencontainers.image.revision'* ]]; then
    printf '<no value>\n'
  elif [[ "$*" == *'.Id}}|{{index'* ]]; then
    if [[ "$image" == *'-api:'* ]]; then printf '%s|%s\n' "$FAKE_API_IMAGE_ID" "$FAKE_SOURCE_SHA"; else printf '%s|%s\n' "$FAKE_WEB_IMAGE_ID" "$FAKE_SOURCE_SHA"; fi
  elif [[ "$*" == *'org.opencontainers.image.revision'* ]]; then printf '%s\n' "$FAKE_SOURCE_SHA"
  elif [[ "$image" == *'-api:'* ]]; then printf '%s\n' "$FAKE_PREVIOUS_API_IMAGE_ID"
  else printf '%s\n' "$FAKE_PREVIOUS_WEB_IMAGE_ID"
  fi
elif [[ "${1:-}" == inspect && "$*" == *'com.docker.compose.project.config_files'* ]]; then
  printf '%s\n' "$FAKE_SHARED_DIR/docker-compose.production.yml,$FAKE_SHARED_DIR/docker-compose.master-tunnel.yml,$FAKE_SHARED_DIR/docker-compose.mail-platform.yml,$FAKE_SHARED_DIR/docker-compose.admin-core.yml,$FAKE_SHARED_DIR/docker-compose.release.yml"
elif [[ "${1:-}" == inspect && "$*" == *'com.docker.compose.project.environment_file'* ]]; then
  printf '%s\n' "$FAKE_SHARED_DIR/.stack.env"
elif [[ "${1:-}" == inspect && "$*" == *'.State.Health.Status'* ]]; then
  printf 'healthy\n'
elif [[ "${1:-}" == network && "${2:-}" == inspect && "$*" == *'.Subnet'* ]]; then
  printf '172.25.52.0/29\n'
elif [[ "${1:-}" == network && "${2:-}" == inspect && "$*" == *'.Gateway'* ]]; then
  printf '172.25.52.1\n'
elif [[ "${1:-}" == network && "${2:-}" == inspect && "$*" == *'bridge.name'* ]]; then
  printf 'asodef-mail0\n'
elif [[ "${1:-}" == network && "${2:-}" == inspect && "$*" == *'.Internal'* ]]; then
  printf 'true\n'
elif [[ "${1:-}" == network && "${2:-}" == inspect && "$*" == *'.Containers'* ]]; then
  printf 'asodef-public-platform-production-api-1=172.25.52.2/29\n'
fi
exit 0
EOF
chmod 0755 "$fake_bin/docker"
FAKE_DOCKER_LOG="$runtime/docker.log" PATH="$fake_bin:$PATH" \
  "$repo_root/ops/admin-core/rollback-public-admin-core.sh" \
    --shared-dir "$runtime" \
    --api-image asodef-public-platform-api:previous \
    --web-image asodef-public-platform-web:previous \
    --apply >/dev/null
for required in \
  "$runtime/docker-compose.production.yml" \
  "$runtime/docker-compose.master-tunnel.yml" \
  "$runtime/docker-compose.mail-platform.yml" \
  "$runtime/docker-compose.admin-core.yml" \
  "$runtime/docker-compose.release.yml" \
  "$repo_root/ops/admin-core/docker-compose.rollback.yml"; do
  grep -Fq -- "--file $required" "$runtime/docker.log"
done
grep -Fq -- '--env-file '"$runtime/.stack.env" "$runtime/docker.log"
grep -Fq -- 'up -d --no-deps --force-recreate api web' "$runtime/docker.log"
if grep -Eq '(^| )down( |$)' "$runtime/docker.log"; then
  echo 'status=error code=ROLLBACK_INVOKED_COMPOSE_DOWN' >&2
  exit 1
fi

# Exercise install and full contract rollback with a fake Docker boundary. The
# prior fixture has no managed overlays, so rollback must recreate API/Web with
# base+Master only and remove only the three managed files.
rollback_runtime="$runtime/rollback-test"
mkdir "$rollback_runtime"
cp "$script_dir/tests/docker-compose.production.yml" "$rollback_runtime/docker-compose.production.yml"
cp "$script_dir/tests/docker-compose.master-tunnel.yml" "$rollback_runtime/docker-compose.master-tunnel.yml"
cp "$script_dir/tests/stack.env" "$rollback_runtime/.stack.env"
chmod 0600 "$rollback_runtime/.stack.env"
printf '%s\n' \
  'DATABASE_URL=synthetic-test-value' \
  'AI_RUNTIME_ENABLED=true' \
  'OPENROUTER_API_KEY=synthetic-openrouter-credential-for-deploy-test' \
  'OPENROUTER_BASE_URL=https://openrouter.ai/api/v1' >"$rollback_runtime/.env.production"
chmod 0600 "$rollback_runtime/.env.production"
: >"$runtime/install-docker.log"
FAKE_DOCKER_LOG="$runtime/install-docker.log" PATH="$fake_bin:$PATH" \
  "$script_dir/install-compose-contract.sh" \
    --shared-dir "$rollback_runtime" \
    --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
    --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
    --apply >/dev/null
for managed in docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml; do
  [[ -f "$rollback_runtime/$managed" ]]
done
if FAKE_DOCKER_LOG="$runtime/rollback-provenance-denied.log" FAKE_PREVIOUS_API_IMAGE_ID="$previous_api_image_id" FAKE_PREVIOUS_WEB_IMAGE_ID="$previous_web_image_id" PATH="$fake_bin:$PATH" \
  "$script_dir/rollback-compose-contract.sh" \
    --shared-dir "$rollback_runtime" \
    --api-image asodef-public-platform-api:previous \
    --api-image-id sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee \
    --web-image asodef-public-platform-web:previous \
    --web-image-id "$previous_web_image_id" \
    --apply >/dev/null 2>&1; then
  echo 'status=error code=ROLLBACK_ACCEPTED_WRONG_IMAGE_ID' >&2
  exit 1
fi
for managed in docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml; do
  [[ -f "$rollback_runtime/$managed" ]]
done
: >"$runtime/rollback-docker.log"
FAKE_DOCKER_LOG="$runtime/rollback-docker.log" FAKE_PREVIOUS_API_IMAGE_ID="$previous_api_image_id" FAKE_PREVIOUS_WEB_IMAGE_ID="$previous_web_image_id" PATH="$fake_bin:$PATH" \
  "$script_dir/rollback-compose-contract.sh" \
    --shared-dir "$rollback_runtime" \
    --api-image asodef-public-platform-api:previous \
    --api-image-id "$previous_api_image_id" \
    --web-image asodef-public-platform-web:previous \
    --web-image-id "$previous_web_image_id" \
    --apply >/dev/null
for managed in docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml; do
  [[ ! -e "$rollback_runtime/$managed" ]]
done
grep -Fq -- "--file $rollback_runtime/docker-compose.production.yml" "$runtime/rollback-docker.log"
grep -Fq -- "--file $rollback_runtime/docker-compose.master-tunnel.yml" "$runtime/rollback-docker.log"
if grep -Fq -- "--file $rollback_runtime/docker-compose.mail-platform.yml" "$runtime/rollback-docker.log"; then
  echo 'status=error code=COMPOSE_INTEGRATION_ROLLBACK_RETAINED_MAIL_OVERLAY' >&2
  exit 1
fi
grep -Fq -- 'up -d --no-deps --force-recreate api web' "$runtime/rollback-docker.log"

# Exercise deployment orchestration through a temporary release-shaped ops
# tree. The real AI writer has its own unit/security suite and intentionally
# refuses to run from a mutable checkout; this sibling is a verify-only test
# boundary so deploy tests cannot accept secret mutation or provisioning.
deploy_repo="$runtime/deploy-repo"
mkdir "$deploy_repo"
cp -a "$repo_root/ops" "$deploy_repo/ops"
cat >"$deploy_repo/ops/production/provision-ai-runtime.py" <<'EOF'
#!/bin/sh
test "$#" -eq 1 && test "$1" = verify || exit 97
printf '%s\n' 'status=ok action=verify aiRuntime=ENABLED openRouterCredential=PRESENT openRouterBaseUrl=VALID secrets=REDACTED'
EOF
chmod 0755 "$deploy_repo/ops/production/provision-ai-runtime.py"
deploy_script="$deploy_repo/ops/production/deploy-public-platform.sh"

# The deployment dry-run validates the exact image's migration plan without
# applying migrations, installing overlays or recreating services.
: >"$runtime/deploy-dry-run.log"
dry_run_output=$(FAKE_DOCKER_LOG="$runtime/deploy-dry-run.log" FAKE_SHARED_DIR="$rollback_runtime" \
  FAKE_API_IMAGE_ID="$api_image_id" FAKE_WEB_IMAGE_ID="$web_image_id" FAKE_SOURCE_SHA="$source_sha" \
  PATH="$fake_bin:$PATH" "$deploy_script" \
    --shared-dir "$rollback_runtime" \
    --source-sha "$source_sha" \
    --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
    --api-image-id "$api_image_id" \
    --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
    --web-image-id "$web_image_id")
grep -Fq "deploy=false scope=api,web migrations=not-applied migrationPlan=$expected_migrations" <<<"$dry_run_output"
grep -Fq -- 'run --rm --network none --read-only' "$runtime/deploy-dry-run.log"
if grep -Eq -- 'migrate deploy|up -d' "$runtime/deploy-dry-run.log"; then
  echo 'status=error code=DRY_RUN_APPLIED_PRODUCTION_CHANGE' >&2
  exit 1
fi
for unexpected_count in $((expected_migrations - 1)) $((expected_migrations + 1)); do
  mismatch_log="$runtime/deploy-wrong-migration-count-$unexpected_count.log"
  : >"$mismatch_log"
  if FAKE_MIGRATION_COUNT="$unexpected_count" FAKE_DOCKER_LOG="$mismatch_log" \
    FAKE_SHARED_DIR="$rollback_runtime" FAKE_API_IMAGE_ID="$api_image_id" FAKE_WEB_IMAGE_ID="$web_image_id" \
    FAKE_SOURCE_SHA="$source_sha" PATH="$fake_bin:$PATH" \
    "$deploy_script" \
      --shared-dir "$rollback_runtime" \
      --source-sha "$source_sha" \
      --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
      --api-image-id "$api_image_id" \
      --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
      --web-image-id "$web_image_id" >/dev/null 2>&1; then
    echo 'status=error code=DRY_RUN_ACCEPTED_WRONG_MIGRATION_COUNT' >&2
    exit 1
  fi
  if grep -Eq -- 'migrate deploy|up -d' "$mismatch_log"; then
    echo 'status=error code=WRONG_MIGRATION_COUNT_REACHED_MUTATION' >&2
    exit 1
  fi
done

: >"$runtime/deploy-docker.log"
if FAKE_DOCKER_LOG="$runtime/deploy-migration-failure.log" FAKE_SHARED_DIR="$rollback_runtime" FAKE_API_IMAGE_ID="$api_image_id" FAKE_WEB_IMAGE_ID="$web_image_id" FAKE_SOURCE_SHA="$source_sha" FAKE_MIGRATION_FAIL=true PATH="$fake_bin:$PATH" \
  "$deploy_script" \
    --shared-dir "$rollback_runtime" \
    --source-sha "$source_sha" \
    --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
    --api-image-id "$api_image_id" \
    --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
    --web-image-id "$web_image_id" \
    --apply >/dev/null 2>&1; then
  echo 'status=error code=DEPLOY_ACCEPTED_MIGRATION_FAILURE' >&2
  exit 1
fi
grep -Fq -- 'run --rm --network asodef_public_platform_data' "$runtime/deploy-migration-failure.log"
if grep -Fq 'up -d' "$runtime/deploy-migration-failure.log"; then
  echo 'status=error code=DEPLOY_RECREATED_SERVICES_AFTER_MIGRATION_FAILURE' >&2
  exit 1
fi
for managed in docker-compose.mail-platform.yml docker-compose.admin-core.yml docker-compose.release.yml; do
  [[ ! -e "$rollback_runtime/$managed" ]] || {
    echo 'status=error code=DEPLOY_INSTALLED_CONTRACT_AFTER_MIGRATION_FAILURE' >&2; exit 1;
  }
done

if FAKE_DOCKER_LOG="$runtime/deploy-provenance-denied.log" FAKE_SHARED_DIR="$rollback_runtime" FAKE_API_IMAGE_ID="$api_image_id" FAKE_WEB_IMAGE_ID="$web_image_id" FAKE_SOURCE_SHA="$source_sha" PATH="$fake_bin:$PATH" \
  "$deploy_script" \
    --shared-dir "$rollback_runtime" \
    --source-sha "$source_sha" \
    --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
    --api-image-id sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee \
    --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
    --web-image-id "$web_image_id" \
    --apply >/dev/null 2>&1; then
  echo 'status=error code=DEPLOY_ACCEPTED_WRONG_IMAGE_ID' >&2
  exit 1
fi
if grep -Fq 'up -d' "$runtime/deploy-provenance-denied.log"; then
  echo 'status=error code=DEPLOY_MUTATED_AFTER_PROVENANCE_FAILURE' >&2
  exit 1
fi
FAKE_DOCKER_LOG="$runtime/deploy-docker.log" FAKE_SHARED_DIR="$rollback_runtime" FAKE_API_IMAGE_ID="$api_image_id" FAKE_WEB_IMAGE_ID="$web_image_id" FAKE_PREVIOUS_API_IMAGE_ID="$previous_api_image_id" FAKE_PREVIOUS_WEB_IMAGE_ID="$previous_web_image_id" FAKE_SOURCE_SHA="$source_sha" PATH="$fake_bin:$PATH" \
  "$deploy_script" \
    --shared-dir "$rollback_runtime" \
    --source-sha "$source_sha" \
    --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
    --api-image-id "$api_image_id" \
    --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
    --web-image-id "$web_image_id" \
    --apply >/dev/null
grep -Fq -- 'up -d --no-deps --force-recreate api web' "$runtime/deploy-docker.log"
grep -Fq -- 'run --rm --network asodef_public_platform_data' "$runtime/deploy-docker.log"
grep -Fq -- "--env EXPECTED_MIGRATIONS=$expected_migrations" "$runtime/deploy-docker.log"
migration_line=$(grep -n -m1 -- 'run --rm --network asodef_public_platform_data' "$runtime/deploy-docker.log" | cut -d: -f1)
up_line=$(grep -n -m1 -- 'up -d --no-deps --force-recreate api web' "$runtime/deploy-docker.log" | cut -d: -f1)
[[ "$migration_line" -lt "$up_line" ]] || {
  echo 'status=error code=PRODUCTION_MIGRATION_ORDER_INVALID' >&2; exit 1;
}
grep -Fq -- 'com.docker.compose.project.config_files' "$runtime/deploy-docker.log"
grep -Fq -- 'com.docker.compose.project.environment_file' "$runtime/deploy-docker.log"
grep -Fq -- 'network inspect asodef_mail_submission' "$runtime/deploy-docker.log"

if ASODEF_COMPOSE_CONTRACT_TEST_MODE=true "$script_dir/install-compose-contract.sh" \
  --shared-dir "$install_runtime" \
  --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
  --web-image asodef-public-platform-web:1111111111111111111111111111111111111111 >/dev/null 2>&1; then
  echo 'status=error code=MIXED_RELEASE_SHA_ACCEPTED' >&2
  exit 1
fi

if find "$script_dir" -type f ! -path '*/tests/stack.env' ! -name 'test-artifacts.sh' \
    ! -name 'create-release-source-artifact.py' ! -name 'test_release_publication.py' -print0 \
  | xargs -0 grep -IEq '(BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY|SMTP_PASSWORD=[^$[:space:]][^[:space:]]+|postgres(ql)?://[^$[:space:]]+:[^$[:space:]@]+@)'; then
  echo 'status=error code=STATIC_SECRET_PATTERN_FOUND' >&2
  exit 1
fi

grep -Fq 'fdexec=never' "$script_dir/install-production-privileged-channel.py"

echo 'status=ok productionComposeArtifacts=PASS rollbackContract=PASS secretScan=PASS'
