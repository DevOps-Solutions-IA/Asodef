#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --archive FILE --checksum FILE --metadata FILE --fingerprint 40_HEX --gpg-home DIR --database NAME --release-sha SHA" >&2
  exit 64
}

archive="" checksum_file="" metadata="" fingerprint="" gpg_home="" database="" release_sha=""
while (($#)); do
  case "$1" in
    --archive) archive=${2:-}; shift 2 ;;
    --checksum) checksum_file=${2:-}; shift 2 ;;
    --metadata) metadata=${2:-}; shift 2 ;;
    --fingerprint) fingerprint=${2:-}; shift 2 ;;
    --gpg-home) gpg_home=${2:-}; shift 2 ;;
    --database) database=${2:-}; shift 2 ;;
    --release-sha) release_sha=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
fingerprint=${fingerprint^^}
[[ -f "$archive" && -f "$checksum_file" && -f "$metadata" && "$fingerprint" =~ ^[0-9A-F]{40}$ && -d "$gpg_home" ]] || usage
[[ "$database" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,62}$ && "$release_sha" =~ ^[0-9a-f]{40}$ ]] || usage
command -v pg_restore >/dev/null && command -v python3 >/dev/null || { echo 'status=error code=CUSTODY_VERIFY_TOOL_UNAVAILABLE' >&2; exit 1; }

(cd "$(dirname "$archive")" && sha256sum --check --status "$(realpath "$checksum_file")") || {
  echo 'status=error code=BACKUP_CHECKSUM_MISMATCH' >&2; exit 1;
}
actual_checksum=$(sha256sum "$archive" | awk '{print $1}')
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
recipient_validation=$("$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$fingerprint" --gpg-home "$gpg_home" --mode secret-required)
encryption_fingerprint=$(sed -n 's/.* encryptionKeyFingerprint=\([0-9A-F]\{40\}\) .*/\1/p' <<<"$recipient_validation")
[[ "$encryption_fingerprint" =~ ^[0-9A-F]{40}$ ]] || {
  echo 'status=error code=CUSTODY_ENCRYPTION_FINGERPRINT_UNAVAILABLE' >&2; exit 1;
}
python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$metadata" --fingerprint "$fingerprint" --encryption-fingerprint "$encryption_fingerprint" \
  --sha256 "$actual_checksum" \
  --size-bytes "$(stat -c '%s' "$archive")" --database "$database" --release-sha "$release_sha" >/dev/null
packet_listing=$(gpg --homedir "$gpg_home" --batch --list-packets "$archive" 2>/dev/null || true)
encryption_key_id=${encryption_fingerprint: -16}
grep -q '^:pubkey enc packet:' <<<"$packet_listing" || { echo 'status=error code=BACKUP_RECIPIENT_PACKET_MISSING' >&2; exit 1; }
[[ $(grep -c '^:pubkey enc packet:' <<<"$packet_listing") == "1" ]] || { echo 'status=error code=BACKUP_RECIPIENT_PACKET_COUNT_INVALID' >&2; exit 1; }
grep -Fq "keyid $encryption_key_id" <<<"$packet_listing" || { echo 'status=error code=BACKUP_RECIPIENT_PACKET_MISMATCH' >&2; exit 1; }

if ! gpg --homedir "$gpg_home" --batch --quiet --decrypt "$archive" 2>/dev/null | pg_restore --list >/dev/null 2>&1; then
  echo 'status=error code=BACKUP_DECRYPTABILITY_FAILED' >&2
  exit 1
fi
echo "status=ok fingerprint=$fingerprint encryptionKeyFingerprint=$encryption_fingerprint checksum=PASS ciphertextRecipient=PASS decryptability=PASS pgArchive=PASS custodyHost=true"
