#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 --archive FILE --checksum FILE --metadata FILE --recipient 40_HEX --gpg-home DIR --database NAME --release-sha SHA --api-image IMAGE --api-image-id sha256:64_HEX" >&2
  exit 64
}

archive="" checksum_file="" metadata="" recipient="" gpg_home="" database="" release_sha="" api_image="" api_image_id=""
while (($#)); do
  case "$1" in
    --archive) archive=${2:-}; shift 2 ;;
    --checksum) checksum_file=${2:-}; shift 2 ;;
    --metadata) metadata=${2:-}; shift 2 ;;
    --recipient) recipient=${2:-}; shift 2 ;;
    --gpg-home) gpg_home=${2:-}; shift 2 ;;
    --database) database=${2:-}; shift 2 ;;
    --release-sha) release_sha=${2:-}; shift 2 ;;
    --api-image) api_image=${2:-}; shift 2 ;;
    --api-image-id) api_image_id=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
recipient=${recipient^^}
[[ -f "$archive" && -f "$checksum_file" && -f "$metadata" && "$recipient" =~ ^[0-9A-F]{40}$ && -d "$gpg_home" ]] || usage
[[ "$database" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,62}$ && "$release_sha" =~ ^[0-9a-f]{40}$ ]] || usage
[[ "$api_image" == "asodef-public-platform-api:$release_sha" ]] || { echo 'status=error code=API_IMAGE_RELEASE_MISMATCH' >&2; exit 1; }
[[ "$api_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || usage
command -v docker >/dev/null && command -v gpg >/dev/null && command -v openssl >/dev/null || {
  echo 'status=error code=REHEARSAL_TOOL_UNAVAILABLE' >&2; exit 1;
}

resolved_image_id=$(docker image inspect --format '{{.Id}}' "$api_image" 2>/dev/null) || {
  echo 'status=error code=RELEASE_API_IMAGE_UNAVAILABLE' >&2; exit 1;
}
[[ "$resolved_image_id" == "$api_image_id" ]] || { echo 'status=error code=API_IMAGE_ID_MISMATCH' >&2; exit 1; }
image_revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$api_image" 2>/dev/null || true)
if [[ -n "$image_revision" && "$image_revision" != "<no value>" && "$image_revision" != "$release_sha" ]]; then
  echo 'status=error code=API_IMAGE_REVISION_LABEL_MISMATCH' >&2
  exit 1
fi
[[ "$image_revision" == "$release_sha" ]] && image_revision_state=PASS || image_revision_state=NOT_PRESENT

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
"$script_dir/verify-encrypted-backup-custody.sh" \
  --archive "$archive" --checksum "$checksum_file" --metadata "$metadata" \
  --fingerprint "$recipient" --gpg-home "$gpg_home" \
  --database "$database" --release-sha "$release_sha" >/dev/null

suffix=$(date -u +%Y%m%d%H%M%S)-$$
container="asodef-admin-restore-$suffix"
redis_container="asodef-admin-restore-redis-$suffix"
api_container="asodef-admin-restore-api-$suffix"
network="asodef-admin-restore-net-$suffix"
runtime_dir=$(mktemp -d)
password=$(openssl rand -hex 24)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=asodef_rehearsal\nPOSTGRES_USER=postgres\n' "$password" > "$runtime_dir/postgres.env"
cleanup() {
  docker rm -f "$api_container" "$redis_container" >/dev/null 2>&1 || true
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$runtime_dir"
}
trap cleanup EXIT

docker network create --internal "$network" >/dev/null
docker run --detach --rm --name "$container" --network "$network" --env-file "$runtime_dir/postgres.env" postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U postgres -d asodef_rehearsal >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d asodef_rehearsal >/dev/null 2>&1 || {
  echo 'status=error code=ISOLATED_POSTGRES_UNAVAILABLE' >&2; exit 1;
}

if ! gpg --homedir "$gpg_home" --batch --quiet --decrypt "$archive" 2>/dev/null \
  | docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges -U postgres -d asodef_rehearsal >/dev/null 2>&1; then
  echo 'status=error code=ISOLATED_RESTORE_FAILED' >&2
  exit 1
fi

database_url="postgresql://postgres:${password}@${container}:5432/asodef_rehearsal?schema=public"
# Migrations run from the exact immutable API image under rehearsal. The VPS
# therefore needs neither a Node/pnpm toolchain nor a mutable source checkout.
# The image-local Prisma binary is used directly: Corepack's pnpm shim may try
# to download pnpm, which is both unnecessary and impossible on this isolated
# network. The URL is passed only as a process environment value and is never
# printed.
docker run --rm --network "$network" --env DATABASE_URL="$database_url" \
  --entrypoint sh "$api_image" -c \
  'test "$(pwd)" = /app/apps/api && test -f prisma/schema.prisma && test -x node_modules/.bin/prisma && node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma >/dev/null 2>&1 && node_modules/.bin/prisma migrate status --schema prisma/schema.prisma >/dev/null 2>&1' || {
    echo 'status=error code=ISOLATED_MIGRATION_FAILED' >&2; exit 1;
  }

applied=$(docker exec "$container" psql -U postgres -d asodef_rehearsal -Atqc \
  'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')
[[ "$applied" == "40" ]] || { echo "status=error code=MIGRATION_COUNT_MISMATCH count=$applied" >&2; exit 1; }
official=$(docker exec "$container" psql -U postgres -d asodef_rehearsal -Atqc \
  "SELECT count(*) FROM users WHERE lower(email)='admin@asodef.com.co' AND lower(coalesce(recovery_email,''))='asodefsas@gmail.com' AND status='ACTIVE';")
[[ "$official" == "1" ]] || { echo 'status=error code=ADMIN_IDENTITY_REHEARSAL_FAILED' >&2; exit 1; }
recovery_login=$(docker exec "$container" psql -U postgres -d asodef_rehearsal -Atqc \
  "SELECT count(*) FROM users WHERE lower(email)='asodefsas@gmail.com';")
[[ "$recovery_login" == "0" ]] || { echo 'status=error code=RECOVERY_LOGIN_IDENTITY_EXISTS' >&2; exit 1; }
unauthorized_privileged=$(docker exec "$container" psql -U postgres -d asodef_rehearsal -Atqc \
  "SELECT count(*) FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id WHERE r.name IN ('ADMIN','SUPER_ADMIN') AND lower(u.email)<>'admin@asodef.com.co';")
[[ "$unauthorized_privileged" == "0" ]] || { echo 'status=error code=UNAUTHORIZED_PRIVILEGED_IDENTITY' >&2; exit 1; }
official_privileged=$(docker exec "$container" psql -U postgres -d asodef_rehearsal -Atqc \
  "SELECT count(*) FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id WHERE r.name='SUPER_ADMIN' AND lower(u.email)='admin@asodef.com.co';")
[[ "$official_privileged" == "1" ]] || { echo 'status=error code=OFFICIAL_SUPER_ADMIN_INVARIANT_FAILED' >&2; exit 1; }

docker run --detach --rm --name "$redis_container" --network "$network" redis:7-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$redis_container" redis-cli ping >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$redis_container" redis-cli ping >/dev/null 2>&1 || { echo 'status=error code=ISOLATED_REDIS_UNAVAILABLE' >&2; exit 1; }

runtime_secret=$(openssl rand -hex 32)
cat > "$runtime_dir/api.env" <<EOF
NODE_ENV=production
API_PORT=3000
DATABASE_URL=postgresql://postgres:${password}@${container}:5432/asodef_rehearsal?schema=public
REDIS_URL=redis://${redis_container}:6379
JWT_SECRET=${runtime_secret}
JWT_REFRESH_SECRET=${runtime_secret}refresh
ENCRYPTION_KEY=${runtime_secret}encryption
PASSWORD_RESET_TOKEN_SECRET=${runtime_secret}reset
CONTRACT_DOWNLOAD_TOKEN_SECRET=${runtime_secret}contract
ADMIN_ACCOUNT_EMAIL=admin@asodef.com.co
ADMIN_RECOVERY_EMAIL=asodefsas@gmail.com
ADMIN_MFA_REQUIRED=false
MASTER_FIREBIRD_ENABLED=false
BOLD_MODE=mock
PRODUCTION_PAYMENTS_ENABLED=false
SMTP_HOST=
SMTP_SECURE=false
CORS_ORIGIN=http://127.0.0.1
EOF
unset runtime_secret
docker run --detach --rm --name "$api_container" --network "$network" --env-file "$runtime_dir/api.env" "$api_image" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$api_container" node -e "require('http').get('http://127.0.0.1:3000/api/v1/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >/dev/null 2>&1; then
    api_ready=true
    break
  fi
  sleep 1
done
[[ "${api_ready:-false}" == "true" ]] || { echo 'status=error code=ISOLATED_API_STARTUP_FAILED' >&2; exit 1; }

echo "status=ok restore=PASS migrations=40 schema=PASS adminInvariant=PASS applicationStartup=PASS apiImageId=$api_image_id imageRevisionLabel=$image_revision_state isolated=true smtp=DISABLED productionModified=false"
