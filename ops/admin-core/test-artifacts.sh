#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for script in "$script_dir"/*.sh; do
  [[ "$script" == "$script_dir/test-artifacts.sh" ]] || bash -n "$script"
done

runtime_dir=$(mktemp -d)
trap 'rm -rf "$runtime_dir"' EXIT
synthetic_key=$(openssl rand -hex 32)
synthetic_password=$(openssl rand -hex 24)
cat > "$runtime_dir/valid.env" <<EOF
ADMIN_ACCOUNT_EMAIL=admin@asodef.com.co
ADMIN_RECOVERY_EMAIL=asodefsas@gmail.com
ADMIN_MFA_REQUIRED=false
ADMIN_MFA_CHALLENGE_TTL_SECONDS=300
ADMIN_MFA_ENROLLMENT_TTL_SECONDS=900
ADMIN_STEP_UP_TTL_SECONDS=300
ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS=5
ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS=300
ENCRYPTION_KEY=$synthetic_key
SMTP_HOST=smtp.invalid
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=synthetic-user
SMTP_PASSWORD=$synthetic_password
SMTP_FROM=no-reply@example.invalid
EOF
unset synthetic_key synthetic_password

"$script_dir/verify-runtime-env.sh" --env-file "$runtime_dir/valid.env" --expected-mfa false >/dev/null
sed 's/^ADMIN_ACCOUNT_EMAIL=.*/ADMIN_ACCOUNT_EMAIL=asodefsas@gmail.com/' \
  "$runtime_dir/valid.env" > "$runtime_dir/invalid.env"
if "$script_dir/verify-runtime-env.sh" --env-file "$runtime_dir/invalid.env" --expected-mfa false >/dev/null 2>&1; then
  echo 'status=error code=ENV_VALIDATOR_ACCEPTED_RECOVERY_LOGIN' >&2
  exit 1
fi

if grep -RIEq --include='*.yml' --include='*.sh' \
  '(BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY|postgres(ql)?://[^$[:space:]]+:[^$[:space:]@]+@|SMTP_PASSWORD:[[:space:]]+[^$])' \
  "$script_dir"; then
  echo 'status=error code=STATIC_SECRET_PATTERN_FOUND' >&2
  exit 1
fi

command -v gpg >/dev/null && command -v python3 >/dev/null || { echo 'status=error code=GPG_TEST_TOOL_UNAVAILABLE' >&2; exit 1; }
python3 -c 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), "verify-backup-metadata.py", "exec")' \
  "$script_dir/verify-backup-metadata.py"
custody_home="$runtime_dir/custody-gnupg"
public_home="$runtime_dir/public-gnupg"
mkdir -m 700 "$custody_home" "$public_home"
gpg --homedir "$custody_home" --batch --passphrase '' \
  --quick-generate-key 'ASODEF artifact test <artifact-test@example.invalid>' ed25519 sign 1d >/dev/null 2>&1
test_fingerprint=$(gpg --homedir "$custody_home" --batch --with-colons --list-keys 2>/dev/null \
  | awk -F: '$1=="fpr" { print toupper($10); exit }')
gpg --homedir "$custody_home" --batch --passphrase '' \
  --quick-add-key "$test_fingerprint" cv25519 encrypt 1d >/dev/null 2>&1

"$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$custody_home" --mode secret-required >/dev/null
test_encryption_fingerprint=$("$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$custody_home" --mode secret-required \
  | sed -n 's/.* encryptionKeyFingerprint=\([0-9A-F]\{40\}\) .*/\1/p')
if "$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$custody_home" --mode public-only >/dev/null 2>&1; then
  echo 'status=error code=PUBLIC_HOST_ACCEPTED_PRIVATE_KEY' >&2
  exit 1
fi

public_export="$runtime_dir/recipient-public.asc"
"$script_dir/export-gpg-public-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$custody_home" --output "$public_export" >/dev/null
"$script_dir/import-gpg-public-recipient.sh" \
  --key-file "$public_export" --checksum "$public_export.sha256" \
  --fingerprint "$test_fingerprint" --gpg-home "$public_home" >/dev/null
"$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$public_home" --mode public-only >/dev/null
if "$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$public_home" --mode secret-required >/dev/null 2>&1; then
  echo 'status=error code=CUSTODY_ACCEPTED_PUBLIC_KEY_ONLY' >&2
  exit 1
fi

fake_bin="$runtime_dir/fake-bin"
fake_backup_dir="$runtime_dir/backup-output"
mkdir "$fake_bin" "$fake_backup_dir"
cat >"$fake_bin/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "inspect" ]]; then exit 0; fi
if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  if [[ "$*" == *'.Config.Labels'* ]]; then echo "${FAKE_REVISION_LABEL:-<no value>}"; else echo 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; fi
  exit 0
fi
if [[ "${1:-}" == "exec" ]]; then printf 'PGDMP synthetic test stream'; exit 0; fi
exit 1
EOF
chmod 755 "$fake_bin/docker"
PATH="$fake_bin:$PATH" "$script_dir/backup-postgres-encrypted.sh" \
  --container synthetic-postgres --database synthetic_db --user synthetic_user \
  --recipient "$test_fingerprint" --gpg-home "$public_home" \
  --output-dir "$fake_backup_dir" --release-sha 0000000000000000000000000000000000000000 >/dev/null
backup_metadata=$(find "$fake_backup_dir" -maxdepth 1 -type f -name '*.metadata.json' -print -quit)
backup_archive=$(find "$fake_backup_dir" -maxdepth 1 -type f -name '*.dump.gpg' -print -quit)
[[ -f "$backup_metadata" ]] || { echo 'status=error code=SYNTHETIC_BACKUP_METADATA_MISSING' >&2; exit 1; }
grep -Fq "\"recipientFingerprint\":\"$test_fingerprint\"" "$backup_metadata" || {
  echo 'status=error code=SYNTHETIC_BACKUP_FINGERPRINT_MISSING' >&2; exit 1;
}
grep -Fq '"encrypted":true,"ciphertextStructure":"PASS","decryptability":"PENDING_CUSTODY_VERIFICATION"' "$backup_metadata" || {
  echo 'status=error code=SYNTHETIC_BACKUP_CUSTODY_STATE_INVALID' >&2; exit 1;
}
backup_sha=$(sha256sum "$backup_archive" | awk '{print $1}')
backup_size=$(stat -c '%s' "$backup_archive")
python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$backup_metadata" --fingerprint "$test_fingerprint" --encryption-fingerprint "$test_encryption_fingerprint" \
  --sha256 "$backup_sha" --size-bytes "$backup_size" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 >/dev/null

duplicate_metadata="$runtime_dir/duplicate.metadata.json"
sed 's/^{/{"sha256":"duplicate",/' "$backup_metadata" >"$duplicate_metadata"
if python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$duplicate_metadata" --fingerprint "$test_fingerprint" --encryption-fingerprint "$test_encryption_fingerprint" \
  --sha256 "$backup_sha" --size-bytes "$backup_size" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 >/dev/null 2>&1; then
  echo 'status=error code=DUPLICATE_BACKUP_METADATA_ACCEPTED' >&2
  exit 1
fi
printf '{malformed' >"$runtime_dir/malformed.metadata.json"
if python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$runtime_dir/malformed.metadata.json" --fingerprint "$test_fingerprint" --encryption-fingerprint "$test_encryption_fingerprint" \
  --sha256 "$backup_sha" --size-bytes "$backup_size" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 >/dev/null 2>&1; then
  echo 'status=error code=MALFORMED_BACKUP_METADATA_ACCEPTED' >&2
  exit 1
fi
if python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$backup_metadata" --fingerprint "$test_fingerprint" --encryption-fingerprint "$test_encryption_fingerprint" \
  --sha256 "$backup_sha" --size-bytes "$backup_size" --database wrong_database \
  --release-sha 0000000000000000000000000000000000000000 >/dev/null 2>&1; then
  echo 'status=error code=WRONG_BACKUP_DATABASE_ACCEPTED' >&2
  exit 1
fi
if python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$backup_metadata" --fingerprint "$test_fingerprint" --encryption-fingerprint "$test_encryption_fingerprint" \
  --sha256 "$backup_sha" --size-bytes "$backup_size" --database synthetic_db \
  --release-sha 1111111111111111111111111111111111111111 >/dev/null 2>&1; then
  echo 'status=error code=WRONG_BACKUP_RELEASE_ACCEPTED' >&2
  exit 1
fi
wrong_encryption_fingerprint="${test_encryption_fingerprint%?}0"
[[ "$wrong_encryption_fingerprint" != "$test_encryption_fingerprint" ]] || wrong_encryption_fingerprint="${test_encryption_fingerprint%?}1"
if python3 "$script_dir/verify-backup-metadata.py" \
  --metadata "$backup_metadata" --fingerprint "$test_fingerprint" --encryption-fingerprint "$wrong_encryption_fingerprint" \
  --sha256 "$backup_sha" --size-bytes "$backup_size" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 >/dev/null 2>&1; then
  echo 'status=error code=WRONG_BACKUP_ENCRYPTION_KEY_ACCEPTED' >&2
  exit 1
fi
wrong_image_output=$("$script_dir/rehearse-postgres-restore.sh" \
  --archive "$backup_archive" --checksum "$backup_archive.sha256" --metadata "$backup_metadata" \
  --recipient "$test_fingerprint" --gpg-home "$custody_home" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 \
  --api-image asodef-public-platform-api:1111111111111111111111111111111111111111 \
  --api-image-id sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2>&1 || true)
grep -Fq 'code=API_IMAGE_RELEASE_MISMATCH' <<<"$wrong_image_output" || {
  echo 'status=error code=WRONG_REHEARSAL_IMAGE_NOT_REJECTED' >&2; exit 1;
}
wrong_image_id_output=$(PATH="$fake_bin:$PATH" "$script_dir/rehearse-postgres-restore.sh" \
  --archive "$backup_archive" --checksum "$backup_archive.sha256" --metadata "$backup_metadata" \
  --recipient "$test_fingerprint" --gpg-home "$custody_home" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 \
  --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
  --api-image-id sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2>&1 || true)
grep -Fq 'code=API_IMAGE_ID_MISMATCH' <<<"$wrong_image_id_output" || {
  echo 'status=error code=WRONG_REHEARSAL_IMAGE_ID_NOT_REJECTED' >&2; exit 1;
}
wrong_revision_output=$(PATH="$fake_bin:$PATH" FAKE_REVISION_LABEL=1111111111111111111111111111111111111111 \
  "$script_dir/rehearse-postgres-restore.sh" \
  --archive "$backup_archive" --checksum "$backup_archive.sha256" --metadata "$backup_metadata" \
  --recipient "$test_fingerprint" --gpg-home "$custody_home" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 \
  --api-image asodef-public-platform-api:0000000000000000000000000000000000000000 \
  --api-image-id sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2>&1 || true)
grep -Fq 'code=API_IMAGE_REVISION_LABEL_MISMATCH' <<<"$wrong_revision_output" || {
  echo 'status=error code=WRONG_IMAGE_REVISION_NOT_REJECTED' >&2; exit 1;
}

# The production API image starts in /app/apps/api. Rehearsal migrations must
# therefore use that package's local scripts and schema path, not monorepo
# --filter arguments or an apps/api-prefixed path that only works at repo root.
grep -Fq 'test "$(pwd)" = /app/apps/api' "$script_dir/rehearse-postgres-restore.sh" || {
  echo 'status=error code=REHEARSAL_IMAGE_WORKDIR_NOT_ENFORCED' >&2; exit 1;
}
grep -Fq 'test -f prisma/schema.prisma && test -x node_modules/.bin/prisma' "$script_dir/rehearse-postgres-restore.sh" || {
  echo 'status=error code=REHEARSAL_IMAGE_MIGRATION_CONTRACT_INVALID' >&2; exit 1;
}
grep -Fq 'node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma' "$script_dir/rehearse-postgres-restore.sh" || {
  echo 'status=error code=REHEARSAL_OFFLINE_MIGRATION_COMMAND_MISSING' >&2; exit 1;
}
grep -Fq 'readonly EXPECTED_MIGRATIONS=51' "$script_dir/rehearse-postgres-restore.sh" || {
  echo 'status=error code=REHEARSAL_MIGRATION_COUNT_CONTRACT_INVALID' >&2; exit 1;
}
grep -Fq 'migrations=$EXPECTED_MIGRATIONS schema=PASS' "$script_dir/rehearse-postgres-restore.sh" || {
  echo 'status=error code=REHEARSAL_MIGRATION_EVIDENCE_INVALID' >&2; exit 1;
}
if grep -Eq -- '--filter @asodef/api|pnpm (exec )?prisma' "$script_dir/rehearse-postgres-restore.sh"; then
  echo 'status=error code=REHEARSAL_USES_REPO_ROOT_COMMAND' >&2
  exit 1
fi

gpg --homedir "$custody_home" --batch --passphrase '' \
  --quick-generate-key 'ASODEF wrong recipient test <wrong-recipient@example.invalid>' ed25519 sign 1d >/dev/null 2>&1
wrong_recipient_fingerprint=$(gpg --homedir "$custody_home" --batch --with-colons --list-keys 2>/dev/null \
  | awk -F: '$1=="pub" { pending=1; next } $1=="fpr" && pending { latest=toupper($10); pending=0 } END { print latest }')
gpg --homedir "$custody_home" --batch --passphrase '' \
  --quick-add-key "$wrong_recipient_fingerprint" cv25519 encrypt 1d >/dev/null 2>&1
wrong_recipient_archive="$runtime_dir/wrong-recipient.dump.gpg"
printf 'PGDMP wrong recipient test stream' \
  | gpg --homedir "$custody_home" --batch --yes --trust-model always --encrypt \
      --recipient "$wrong_recipient_fingerprint" --output "$wrong_recipient_archive" 2>/dev/null
wrong_recipient_sha=$(sha256sum "$wrong_recipient_archive" | awk '{print $1}')
printf '%s  %s\n' "$wrong_recipient_sha" "$(basename "$wrong_recipient_archive")" >"$wrong_recipient_archive.sha256"
python3 - "$backup_metadata" "$runtime_dir/wrong-recipient.metadata.json" "$wrong_recipient_archive" "$wrong_recipient_sha" <<'PY'
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    document = json.load(source)
document["sizeBytes"] = os.stat(sys.argv[3]).st_size
document["sha256"] = sys.argv[4]
with open(sys.argv[2], "w", encoding="utf-8") as target:
    json.dump(document, target, separators=(",", ":"))
PY
wrong_recipient_output=$("$script_dir/verify-encrypted-backup-custody.sh" \
  --archive "$wrong_recipient_archive" --checksum "$wrong_recipient_archive.sha256" \
  --metadata "$runtime_dir/wrong-recipient.metadata.json" --fingerprint "$test_fingerprint" \
  --gpg-home "$custody_home" --database synthetic_db \
  --release-sha 0000000000000000000000000000000000000000 2>&1 || true)
grep -Fq 'code=BACKUP_RECIPIENT_PACKET_MISMATCH' <<<"$wrong_recipient_output" || {
  echo 'status=error code=WRONG_CIPHERTEXT_RECIPIENT_NOT_REJECTED' >&2; exit 1;
}

polluted_home="$runtime_dir/polluted-public-gnupg"
mkdir -m 700 "$polluted_home"
"$script_dir/import-gpg-public-recipient.sh" \
  --key-file "$public_export" --checksum "$public_export.sha256" \
  --fingerprint "$test_fingerprint" --gpg-home "$polluted_home" >/dev/null
gpg --homedir "$polluted_home" --batch --passphrase '' \
  --quick-generate-key 'ASODEF unrelated secret test <unrelated@example.invalid>' ed25519 sign 1d >/dev/null 2>&1
if "$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$test_fingerprint" --gpg-home "$polluted_home" --mode public-only >/dev/null 2>&1; then
  echo 'status=error code=PUBLIC_HOST_ACCEPTED_UNRELATED_PRIVATE_KEY' >&2
  exit 1
fi

bad_fingerprint="${test_fingerprint%?}0"
[[ "$bad_fingerprint" != "$test_fingerprint" ]] || bad_fingerprint="${test_fingerprint%?}1"
if "$script_dir/import-gpg-public-recipient.sh" \
  --key-file "$public_export" --checksum "$public_export.sha256" \
  --fingerprint "$bad_fingerprint" --gpg-home "$public_home" >/dev/null 2>&1; then
  echo 'status=error code=IMPORT_ACCEPTED_WRONG_FINGERPRINT' >&2
  exit 1
fi

signing_home="$runtime_dir/signing-only-gnupg"
mkdir -m 700 "$signing_home"
gpg --homedir "$signing_home" --batch --passphrase '' \
  --quick-generate-key 'ASODEF signing-only test <signing-test@example.invalid>' ed25519 sign 1d >/dev/null 2>&1
signing_fingerprint=$(gpg --homedir "$signing_home" --batch --with-colons --list-keys 2>/dev/null \
  | awk -F: '$1=="fpr" { print toupper($10); exit }')
if "$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$signing_fingerprint" --gpg-home "$signing_home" --mode any >/dev/null 2>&1; then
  echo 'status=error code=SIGNING_ONLY_KEY_ACCEPTED' >&2
  exit 1
fi

expired_home="$runtime_dir/expired-gnupg"
mkdir -m 700 "$expired_home"
gpg --homedir "$expired_home" --batch --passphrase '' --faked-system-time 20200101T000000 \
  --quick-generate-key 'ASODEF expired test <expired-test@example.invalid>' ed25519 sign 1d >/dev/null 2>&1
expired_fingerprint=$(gpg --homedir "$expired_home" --batch --with-colons --list-keys 2>/dev/null \
  | awk -F: '$1=="fpr" { print toupper($10); exit }')
gpg --homedir "$expired_home" --batch --passphrase '' --faked-system-time 20200101T000000 \
  --quick-add-key "$expired_fingerprint" cv25519 encrypt 1d >/dev/null 2>&1
if "$script_dir/verify-gpg-recipient.sh" \
  --fingerprint "$expired_fingerprint" --gpg-home "$expired_home" --mode any >/dev/null 2>&1; then
  echo 'status=error code=EXPIRED_KEY_ACCEPTED' >&2
  exit 1
fi

if grep -Eq 'gpg .*--decrypt' "$script_dir/backup-postgres-encrypted.sh"; then
  echo 'status=error code=VPS_BACKUP_REQUIRES_PRIVATE_KEY' >&2
  exit 1
fi

echo 'status=ok syntax=PASS envValidation=PASS negativeIdentity=PASS gpgFingerprint=PASS gpgPublicOnlyGlobal=PASS gpgCapability=PASS gpgExpiry=PASS backupMetadata=PASS ciphertextRecipient=PASS imageIdBinding=PASS imageRevisionBinding=PASS exactReleaseBinding=PASS encryptedBackupBoundary=PASS staticSecretScan=PASS'
