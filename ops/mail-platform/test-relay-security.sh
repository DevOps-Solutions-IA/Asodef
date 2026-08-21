#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

load_config "${1:-}"
require_root
require_secure_config "$1"
require_secure_password_file
require_command swaks
require_command openssl
require_command python3

TEST_EXTERNAL_RECIPIENT=${MAIL_TEST_EXTERNAL_RECIPIENT:-open-relay-probe@example.net}
case "$TEST_EXTERNAL_RECIPIENT" in *@example.net) : ;; *) die unsafe_test_recipient ;; esac

for mail_probe_host in "$MAIL_LISTEN_ADDRESS" 127.0.0.1; do
  mail_output=$(swaks --server "$mail_probe_host" --port 25 --quit-after RCPT \
    --from "probe@$MAIL_DOMAIN" --to "$TEST_EXTERNAL_RECIPIENT" --timeout 10s 2>&1 || true)
  printf '%s\n' "$mail_output" | grep -Eqi '(^|[[:space:]])(454|550|553|554)[ -]|connection refused|timed? out|no route' || die "unauthenticated_relay_not_rejected_$mail_probe_host"
done

openssl s_client -starttls smtp -connect "$MAIL_LISTEN_ADDRESS:587" -servername "$MAIL_HOSTNAME" \
  -verify_hostname "$MAIL_HOSTNAME" </dev/null 2>/dev/null | grep -F 'Verify return code: 0 (ok)' >/dev/null || die tls_verification_failed

python3 "$SCRIPT_DIR/authorized-negative-tests.py" \
  --connect-host "$MAIL_LISTEN_ADDRESS" \
  --tls-hostname "$MAIL_HOSTNAME" \
  --port 587 \
  --user "$MAIL_SMTP_USER@$MAIL_DOMAIN" \
  --password-file "$MAIL_SMTP_PASSWORD_FILE" \
  --allowed-from "$MAIL_SMTP_FROM" \
  --oversize "$((MAIL_MESSAGE_SIZE_LIMIT + 1))"

echo 'status=ok private_relay=rejected loopback_relay=rejected submission_unauthenticated=rejected tls=verified spoof=rejected oversize=rejected'
