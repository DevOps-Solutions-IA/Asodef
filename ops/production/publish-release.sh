#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --repository OWNER/REPO --source-sha SHA --run-id ID --host HOST --user USER --ssh-key FILE --release-root DIR [--apply]" >&2
  exit 64
}

repository='' source_sha='' run_id='' remote_host='' remote_user='' ssh_key='' release_root='' apply=false
while (($#)); do
  case "$1" in
    --repository) repository=${2:-}; shift 2 ;;
    --source-sha) source_sha=${2:-}; shift 2 ;;
    --run-id) run_id=${2:-}; shift 2 ;;
    --host) remote_host=${2:-}; shift 2 ;;
    --user) remote_user=${2:-}; shift 2 ;;
    --ssh-key) ssh_key=${2:-}; shift 2 ;;
    --release-root) release_root=${2:-}; shift 2 ;;
    --apply) apply=true; shift ;;
    *) usage ;;
  esac
done

[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || usage
[[ "$source_sha" =~ ^[0-9a-f]{40}$ && "$run_id" =~ ^[1-9][0-9]*$ ]] || usage
[[ "$remote_host" =~ ^[A-Za-z0-9.-]+$ && "$remote_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || usage
[[ "$release_root" =~ ^/opt/asodef/public-platform/releases$ ]] || usage
[[ -f "$ssh_key" && ! -L "$ssh_key" && "$(stat -c '%a' "$ssh_key")" == 600 ]] || {
  echo 'status=error code=SSH_KEY_UNSAFE' >&2; exit 1;
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for command in gh jq python3 ssh scp tar sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "status=error code=MISSING_COMMAND name=$command" >&2; exit 1; }
done

run_json=$(gh run view "$run_id" --repo "$repository" --json headSha,headBranch,event,status,conclusion,url)
[[ "$(jq -r .headSha <<<"$run_json")" == "$source_sha" ]] &&
  [[ "$(jq -r .headBranch <<<"$run_json")" == main ]] &&
  [[ "$(jq -r .event <<<"$run_json")" == push ]] &&
  [[ "$(jq -r .status <<<"$run_json")" == completed ]] &&
  [[ "$(jq -r .conclusion <<<"$run_json")" == success ]] || {
    echo 'status=error code=GITHUB_RUN_PROVENANCE_INVALID' >&2; exit 1;
  }
artifact_digest=$(gh api "repos/$repository/actions/runs/$run_id/artifacts" \
  --jq ".artifacts[] | select(.name == \"asodef-production-$source_sha\" and .expired == false) | .digest")
[[ "$artifact_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo 'status=error code=GITHUB_ARTIFACT_PROVENANCE_INVALID' >&2; exit 1;
}

temporary=$(mktemp -d)
remote_stage=''
cleanup() {
  if [[ -n "$remote_stage" ]]; then
    printf -v remote_cleanup_command 'rm -rf -- %q' "$remote_stage"
    # The command is deliberately assembled client-side; every value is shell-escaped with printf %q.
    # shellcheck disable=SC2029
    ssh "${ssh_args[@]}" "$remote_user@$remote_host" "$remote_cleanup_command" >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary"
}
trap cleanup EXIT
artifact="$temporary/artifact"
mkdir -m 0700 "$artifact"
gh run download "$run_id" --repo "$repository" --name "asodef-production-$source_sha" --dir "$artifact"

manifest="$artifact/release-source-manifest.json"
archive="$artifact/source.tar.gz"
checksums="$artifact/checksums.sha256"
for path in "$manifest" "$archive" "$checksums"; do
  [[ -f "$path" && ! -L "$path" ]] || { echo 'status=error code=ARTIFACT_FILE_UNAVAILABLE' >&2; exit 1; }
done
(cd "$artifact" && sha256sum --check --strict checksums.sha256 >/dev/null)
[[ "$(jq -r .sourceSha "$manifest")" == "$source_sha" ]] &&
  [[ "$(jq -r .workflowRunId "$manifest")" == "$run_id" ]] || {
    echo 'status=error code=ARTIFACT_MANIFEST_MISMATCH' >&2; exit 1;
  }

validation_root="$temporary/releases"
mkdir "$validation_root"
"$script_dir/install-published-release.py" \
  --artifact-dir "$artifact" --release-root "$validation_root" --source-sha "$source_sha"

artifact_hash=$(jq -r .sourceArchive.sha256 "$manifest")
if [[ "$apply" != true ]]; then
  echo "status=ready action=publish apply=false sourceSha=$source_sha runId=$run_id artifactHash=$artifact_hash artifactDigest=$artifact_digest provenance=PASS"
  exit 0
fi

installer="$temporary/install-published-release.py"
tar -xOf "$archive" source/ops/production/install-published-release.py >"$installer"
chmod 0700 "$installer"
[[ "$(sha256sum "$installer" | awk '{print $1}')" == "$(jq -r .installer.sha256 "$manifest")" ]] || {
  echo 'status=error code=INSTALLER_EXTRACTION_HASH_MISMATCH' >&2; exit 1;
}

ssh_args=(-i "$ssh_key" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes)
printf -v remote_create_command 'mktemp -d %q' \
  "/opt/asodef/public-platform/shared/.release-artifact.$source_sha.XXXXXX"
# The command is deliberately assembled client-side from a validated SHA and a fixed path.
# shellcheck disable=SC2029
remote_stage=$(ssh "${ssh_args[@]}" "$remote_user@$remote_host" \
  "$remote_create_command")
[[ "$remote_stage" =~ ^/opt/asodef/public-platform/shared/\.release-artifact\.$source_sha\.[A-Za-z0-9]+$ ]] || {
  echo 'status=error code=REMOTE_STAGE_INVALID' >&2; exit 1;
}
scp "${ssh_args[@]}" "$manifest" "$archive" "$checksums" "$installer" "$remote_user@$remote_host:$remote_stage/" >/dev/null
printf -v remote_install_command 'python3 %q --artifact-dir %q --release-root %q --source-sha %q --apply' \
  "$remote_stage/install-published-release.py" "$remote_stage" "$release_root" "$source_sha"
# All client-side values are allowlisted or shell-escaped with printf %q.
# shellcheck disable=SC2029
ssh "${ssh_args[@]}" "$remote_user@$remote_host" \
  "$remote_install_command"
printf -v remote_cleanup_command 'rm -rf -- %q' "$remote_stage"
# The validated remote staging path is shell-escaped with printf %q.
# shellcheck disable=SC2029
ssh "${ssh_args[@]}" "$remote_user@$remote_host" "$remote_cleanup_command"
remote_stage=''
echo "status=ok action=publish apply=YES sourceSha=$source_sha runId=$run_id artifactHash=$artifact_hash artifactDigest=$artifact_digest transfer=VERSIONED"
