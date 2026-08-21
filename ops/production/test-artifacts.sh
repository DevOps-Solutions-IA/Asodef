#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
for script in "$script_dir"/*.sh "$repo_root/ops/admin-core/rollback-public-admin-core.sh"; do bash -n "$script"; done
python3 -c 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")' \
  "$script_dir/test-compose-contract.py"

runtime=$(mktemp -d)
trap 'rm -rf "$runtime"' EXIT
cp "$script_dir/tests/docker-compose.production.yml" "$runtime/docker-compose.production.yml"
cp "$script_dir/tests/docker-compose.master-tunnel.yml" "$runtime/docker-compose.master-tunnel.yml"
cp "$script_dir/tests/stack.env" "$runtime/.stack.env"
cp "$repo_root/ops/mail-platform/docker-compose.mail-platform.yml" "$runtime/docker-compose.mail-platform.yml"
cp "$repo_root/ops/admin-core/docker-compose.admin-core.yml" "$runtime/docker-compose.admin-core.yml"
sed \
  -e 's#@@API_IMAGE@@#asodef-public-platform-api:0000000000000000000000000000000000000000#' \
  -e 's#@@WEB_IMAGE@@#asodef-public-platform-web:0000000000000000000000000000000000000000#' \
  "$script_dir/docker-compose.release.yml.template" >"$runtime/docker-compose.release.yml"

install_runtime="$runtime/install-test"
mkdir "$install_runtime"
cp "$script_dir/tests/docker-compose.production.yml" "$install_runtime/docker-compose.production.yml"
cp "$script_dir/tests/docker-compose.master-tunnel.yml" "$install_runtime/docker-compose.master-tunnel.yml"
cp "$script_dir/tests/stack.env" "$install_runtime/.stack.env"
chmod 0600 "$install_runtime/.stack.env"
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
if [[ "${1:-}" == image && "${2:-}" == inspect && "$*" == *'--format'* ]]; then
  printf '<no value>\n'
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
: >"$runtime/rollback-docker.log"
FAKE_DOCKER_LOG="$runtime/rollback-docker.log" PATH="$fake_bin:$PATH" \
  "$script_dir/rollback-compose-contract.sh" \
    --shared-dir "$rollback_runtime" \
    --api-image asodef-public-platform-api:previous \
    --web-image asodef-public-platform-web:previous \
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

: >"$runtime/deploy-docker.log"
FAKE_DOCKER_LOG="$runtime/deploy-docker.log" FAKE_SHARED_DIR="$rollback_runtime" PATH="$fake_bin:$PATH" \
  "$script_dir/deploy-public-platform.sh" \
    --shared-dir "$rollback_runtime" \
    --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
    --web-image asodef-public-platform-web:0000000000000000000000000000000000000000 \
    --apply >/dev/null
grep -Fq -- 'up -d --no-deps --force-recreate api web' "$runtime/deploy-docker.log"
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

if find "$script_dir" -type f ! -path '*/tests/stack.env' ! -name 'test-artifacts.sh' -print0 \
  | xargs -0 grep -IEq '(BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY|SMTP_PASSWORD=[^$[:space:]][^[:space:]]+|postgres(ql)?://[^$[:space:]]+:[^$[:space:]@]+@)'; then
  echo 'status=error code=STATIC_SECRET_PATTERN_FOUND' >&2
  exit 1
fi

echo 'status=ok productionComposeArtifacts=PASS rollbackContract=PASS secretScan=PASS'
