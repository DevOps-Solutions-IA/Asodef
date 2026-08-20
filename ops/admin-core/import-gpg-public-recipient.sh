#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 --key-file FILE --checksum FILE --fingerprint 40_HEX --gpg-home DIR" >&2
  exit 64
}

key_file="" checksum_file="" fingerprint="" gpg_home=""
while (($#)); do
  case "$1" in
    --key-file) key_file=${2:-}; shift 2 ;;
    --checksum) checksum_file=${2:-}; shift 2 ;;
    --fingerprint) fingerprint=${2:-}; shift 2 ;;
    --gpg-home) gpg_home=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
fingerprint=${fingerprint^^}
[[ -f "$key_file" && -f "$checksum_file" && "$fingerprint" =~ ^[0-9A-F]{40}$ ]] || usage
[[ -d "$gpg_home" ]] || { echo 'status=error code=GPG_HOME_UNAVAILABLE' >&2; exit 1; }
gpg_home_mode=$(stat -c '%a' "$gpg_home")
(( (8#$gpg_home_mode & 077) == 0 )) || { echo 'status=error code=GPG_HOME_PERMISSIONS_UNSAFE' >&2; exit 1; }

(cd "$(dirname "$key_file")" && sha256sum --check --status "$(realpath "$checksum_file")") || {
  echo 'status=error code=PUBLIC_KEY_CHECKSUM_MISMATCH' >&2; exit 1;
}
shown=$(gpg --homedir "$gpg_home" --batch --with-colons --show-keys "$key_file" 2>/dev/null) || {
  echo 'status=error code=PUBLIC_KEY_INVALID' >&2; exit 1;
}
[[ $(awk -F: '$1=="pub" { count++ } END { print count+0 }' <<<"$shown") == "1" ]] || {
  echo 'status=error code=PUBLIC_KEY_COUNT_INVALID' >&2; exit 1;
}
[[ $(awk -F: '$1=="fpr" { print toupper($10); exit }' <<<"$shown") == "$fingerprint" ]] || {
  echo 'status=error code=PUBLIC_KEY_FINGERPRINT_MISMATCH' >&2; exit 1;
}
[[ $(awk -F: '$1=="sec" { count++ } END { print count+0 }' <<<"$shown") == "0" ]] || {
  echo 'status=error code=PRIVATE_KEY_IMPORT_REJECTED' >&2; exit 1;
}
now=$(date +%s)
usable_encryption=$(awk -F: -v now="$now" '
  ($1=="pub" || $1=="sub") && $2 != "r" && $2 != "e" && $2 != "d" && index($12, "e") > 0 && ($7 == "" || $7 == "0" || $7 > now) { count++ }
  END { print count+0 }
' <<<"$shown")
((usable_encryption >= 1)) || { echo 'status=error code=GPG_ENCRYPTION_CAPABILITY_UNAVAILABLE' >&2; exit 1; }
existing_secret=$(gpg --homedir "$gpg_home" --batch --with-colons --list-secret-keys 2>/dev/null \
  | awk -F: '$1=="sec" { count++ } END { print count+0 }' || true)
[[ "${existing_secret:-0}" == "0" ]] || { echo 'status=error code=PRIVATE_KEY_PRESENT_ON_PUBLIC_HOST' >&2; exit 1; }

gpg --homedir "$gpg_home" --batch --import "$key_file" >/dev/null 2>&1
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
"$script_dir/verify-gpg-recipient.sh" --fingerprint "$fingerprint" --gpg-home "$gpg_home" --mode public-only >/dev/null
echo "status=ok fingerprint=$fingerprint publicOnly=true imported=true"
