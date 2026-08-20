#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 --container NAME --database NAME --user NAME --recipient GPG_ID --output-dir DIR --release-sha SHA" >&2
  exit 64
}

container="" database="" db_user="" recipient="" output_dir="" release_sha=""
while (($#)); do
  case "$1" in
    --container) container=${2:-}; shift 2 ;;
    --database) database=${2:-}; shift 2 ;;
    --user) db_user=${2:-}; shift 2 ;;
    --recipient) recipient=${2:-}; shift 2 ;;
    --output-dir) output_dir=${2:-}; shift 2 ;;
    --release-sha) release_sha=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$container" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] || usage
[[ "$database" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,62}$ ]] || usage
[[ "$db_user" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,62}$ ]] || usage
[[ -n "$recipient" && "$release_sha" =~ ^[0-9a-f]{40}$ ]] || usage
[[ -d "$output_dir" && "$output_dir" != "/" ]] || { echo 'status=error code=OUTPUT_DIR_UNSAFE' >&2; exit 1; }
command -v docker >/dev/null && command -v gpg >/dev/null && command -v sha256sum >/dev/null || {
  echo 'status=error code=BACKUP_TOOL_UNAVAILABLE' >&2; exit 1;
}
docker inspect "$container" >/dev/null 2>&1 || { echo 'status=error code=POSTGRES_CONTAINER_UNAVAILABLE' >&2; exit 1; }
gpg --batch --list-keys "$recipient" >/dev/null 2>&1 || { echo 'status=error code=GPG_RECIPIENT_UNAVAILABLE' >&2; exit 1; }

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
base="$output_dir/asodef-postgres-${timestamp}-${release_sha:0:12}"
archive="$base.dump.gpg"
temporary="$archive.partial"
error_file=$(mktemp)
trap 'rm -f "$temporary" "$error_file" "$error_file.gpg"' EXIT

if ! docker exec "$container" pg_dump --format=custom --no-owner --no-privileges --username "$db_user" "$database" 2>"$error_file" \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$recipient" --output "$temporary" 2>"$error_file.gpg"; then
  rm -f "$error_file.gpg"
  echo 'status=error code=ENCRYPTED_BACKUP_FAILED' >&2
  exit 1
fi
[[ -s "$temporary" ]] || { echo 'status=error code=BACKUP_EMPTY' >&2; exit 1; }
gpg --batch --quiet --decrypt "$temporary" >/dev/null 2>&1 || { echo 'status=error code=BACKUP_DECRYPTABILITY_FAILED' >&2; exit 1; }
mv "$temporary" "$archive"
checksum=$(sha256sum "$archive" | awk '{print $1}')
size=$(stat -c '%s' "$archive")
printf '%s  %s\n' "$checksum" "$(basename "$archive")" > "$archive.sha256"
printf '{"timestamp":"%s","sizeBytes":%s,"sha256":"%s","database":"%s","releaseSha":"%s","encrypted":true,"decryptability":"PASS"}\n' \
  "$timestamp" "$size" "$checksum" "$database" "$release_sha" > "$archive.metadata.json"
echo "status=ok archive=$(basename "$archive") sizeBytes=$size sha256=$checksum encrypted=true decryptability=PASS"
