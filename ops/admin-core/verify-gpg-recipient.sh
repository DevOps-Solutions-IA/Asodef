#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --fingerprint 40_HEX --gpg-home DIR --mode public-only|secret-required|any" >&2
  exit 64
}

fingerprint="" gpg_home="" mode=""
while (($#)); do
  case "$1" in
    --fingerprint) fingerprint=${2:-}; shift 2 ;;
    --gpg-home) gpg_home=${2:-}; shift 2 ;;
    --mode) mode=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done

fingerprint=${fingerprint^^}
[[ "$fingerprint" =~ ^[0-9A-F]{40}$ ]] || usage
[[ -d "$gpg_home" ]] || { echo 'status=error code=GPG_HOME_UNAVAILABLE' >&2; exit 1; }
gpg_home_mode=$(stat -c '%a' "$gpg_home")
(( (8#$gpg_home_mode & 077) == 0 )) || { echo 'status=error code=GPG_HOME_PERMISSIONS_UNSAFE' >&2; exit 1; }
[[ "$mode" == "public-only" || "$mode" == "secret-required" || "$mode" == "any" ]] || usage
command -v gpg >/dev/null || { echo 'status=error code=GPG_UNAVAILABLE' >&2; exit 1; }

listing=$(gpg --homedir "$gpg_home" --batch --with-colons --list-keys "$fingerprint" 2>/dev/null) || {
  echo 'status=error code=GPG_RECIPIENT_UNAVAILABLE' >&2
  exit 1
}
primary_fingerprint=$(awk -F: '$1=="fpr" { print toupper($10); exit }' <<<"$listing")
[[ "$primary_fingerprint" == "$fingerprint" ]] || {
  echo 'status=error code=GPG_FINGERPRINT_MISMATCH' >&2
  exit 1
}

now=$(date +%s)
read -r encryption_fingerprint encryption_expiry < <(
  awk -F: -v now="$now" '
    $1=="pub" || $1=="sub" {
      valid=($2 != "r" && $2 != "e" && $2 != "d")
      usable=(index($12, "e") > 0)
      current=($7 == "" || $7 == "0" || $7 > now)
      pending=(valid && usable && current)
      expiry=$7
      next
    }
    $1=="fpr" && pending { print toupper($10), (expiry == "" || expiry == "0" ? "none" : expiry); exit }
  ' <<<"$listing"
) || true
[[ -n "${encryption_fingerprint:-}" ]] || {
  echo 'status=error code=GPG_ENCRYPTION_CAPABILITY_UNAVAILABLE' >&2
  exit 1
}

all_secret_listing=$(gpg --homedir "$gpg_home" --batch --with-colons --list-secret-keys 2>/dev/null || true)
all_secret_count=$(awk -F: '$1=="sec" { count++ } END { print count+0 }' <<<"$all_secret_listing")
secret_listing=$(gpg --homedir "$gpg_home" --batch --with-colons --list-secret-keys "$fingerprint" 2>/dev/null || true)
secret_count=$(awk -F: '$1=="sec" { count++ } END { print count+0 }' <<<"$secret_listing")
case "$mode" in
  public-only)
    [[ "$all_secret_count" == "0" ]] || { echo 'status=error code=PRIVATE_KEY_PRESENT_ON_PUBLIC_HOST' >&2; exit 1; }
    secret_state=ABSENT_GLOBAL
    ;;
  secret-required)
    [[ "$secret_count" == "1" ]] || { echo 'status=error code=CUSTODY_PRIVATE_KEY_UNAVAILABLE' >&2; exit 1; }
    secret_primary=$(awk -F: '$1=="fpr" { print toupper($10); exit }' <<<"$secret_listing")
    [[ "$secret_primary" == "$fingerprint" ]] || { echo 'status=error code=CUSTODY_PRIVATE_KEY_MISMATCH' >&2; exit 1; }
    secret_encryption_fingerprint=$(awk -F: -v now="$now" '
      $1=="sec" || $1=="ssb" {
        pending=($2 != "r" && $2 != "e" && $2 != "d" && index($12, "e") > 0 && ($7 == "" || $7 == "0" || $7 > now))
        next
      }
      $1=="fpr" && pending { print toupper($10); exit }
    ' <<<"$secret_listing")
    [[ "$secret_encryption_fingerprint" == "$encryption_fingerprint" ]] || {
      echo 'status=error code=CUSTODY_DECRYPTION_KEY_MISMATCH' >&2; exit 1;
    }
    secret_state=PRESENT
    ;;
  any)
    [[ "$secret_count" == "0" ]] && secret_state=ABSENT || secret_state=PRESENT
    ;;
esac

echo "status=ok fingerprint=$fingerprint encryptionKeyFingerprint=$encryption_fingerprint encryptionExpiry=$encryption_expiry secretMaterial=$secret_state"
