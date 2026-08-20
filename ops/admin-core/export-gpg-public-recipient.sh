#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 --fingerprint 40_HEX --gpg-home DIR --output FILE" >&2
  exit 64
}

fingerprint="" gpg_home="" output=""
while (($#)); do
  case "$1" in
    --fingerprint) fingerprint=${2:-}; shift 2 ;;
    --gpg-home) gpg_home=${2:-}; shift 2 ;;
    --output) output=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
fingerprint=${fingerprint^^}
[[ "$fingerprint" =~ ^[0-9A-F]{40}$ && -d "$gpg_home" && -n "$output" ]] || usage
[[ -d "$(dirname "$output")" && ! -e "$output" ]] || { echo 'status=error code=PUBLIC_EXPORT_TARGET_UNSAFE' >&2; exit 1; }

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
"$script_dir/verify-gpg-recipient.sh" --fingerprint "$fingerprint" --gpg-home "$gpg_home" --mode any >/dev/null

temporary="$output.partial"
trap 'rm -f "$temporary"' EXIT
gpg --homedir "$gpg_home" --batch --armor --export "$fingerprint" >"$temporary"
[[ -s "$temporary" ]] || { echo 'status=error code=PUBLIC_EXPORT_EMPTY' >&2; exit 1; }
shown=$(gpg --homedir "$gpg_home" --batch --with-colons --show-keys "$temporary" 2>/dev/null)
[[ $(awk -F: '$1=="pub" { count++ } END { print count+0 }' <<<"$shown") == "1" ]] || {
  echo 'status=error code=PUBLIC_EXPORT_KEY_COUNT_INVALID' >&2; exit 1;
}
[[ $(awk -F: '$1=="fpr" { print toupper($10); exit }' <<<"$shown") == "$fingerprint" ]] || {
  echo 'status=error code=PUBLIC_EXPORT_FINGERPRINT_MISMATCH' >&2; exit 1;
}
[[ $(awk -F: '$1=="sec" { count++ } END { print count+0 }' <<<"$shown") == "0" ]] || {
  echo 'status=error code=PRIVATE_KEY_EXPORT_REJECTED' >&2; exit 1;
}
mv "$temporary" "$output"
checksum=$(sha256sum "$output" | awk '{print $1}')
printf '%s  %s\n' "$checksum" "$(basename "$output")" >"$output.sha256"
printf '{"fingerprint":"%s","sha256":"%s","publicOnly":true}\n' "$fingerprint" "$checksum" >"$output.metadata.json"
echo "status=ok fingerprint=$fingerprint sizeBytes=$(stat -c '%s' "$output") sha256=$checksum publicOnly=true"
