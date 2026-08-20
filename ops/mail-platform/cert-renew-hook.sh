#!/usr/bin/env sh
set -eu

if [ "${ASODEF_MAIL_TLS_TEST_MODE:-NO}" = YES ] && [ "$(id -u)" -ne 0 ]; then
  TARGET_DIR=${ASODEF_MAIL_TLS_TEST_TARGET_DIR:?}
  RENEWED_LINEAGE=${ASODEF_MAIL_TLS_TEST_LINEAGE:?}
  RECOVERY_SCRIPT=${ASODEF_MAIL_TLS_TEST_RECOVERY_SCRIPT:?}
  TEST_FAILURE=${ASODEF_MAIL_TLS_TEST_FAILURE:-none}
else
  [ "$(id -u)" -eq 0 ] || exit 1
  [ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/smtp.asodef.com.co" ] || exit 0
  TARGET_DIR=/etc/postfix/tls
  RECOVERY_SCRIPT=/usr/local/sbin/asodef-mail-tls-recover
  TEST_FAILURE=none
fi

TARGET_CERT=$TARGET_DIR/fullchain.pem
TARGET_KEY=$TARGET_DIR/privkey.pem
SOURCE_CERT=$RENEWED_LINEAGE/fullchain.pem
SOURCE_KEY=$RENEWED_LINEAGE/privkey.pem
TRANSACTION_DIR=$TARGET_DIR/.renewal-transaction

[ -d "$TARGET_DIR" ] && [ ! -L "$TARGET_DIR" ] || exit 1
[ "$TEST_FAILURE" != none ] || {
  [ "$(stat -c %u "$TARGET_DIR")" -eq 0 ] || exit 1
  case "$(stat -c %a "$TARGET_DIR")" in 700|750|755) : ;; *) exit 1 ;; esac
}
[ -x "$RECOVERY_SCRIPT" ] || exit 1
"$RECOVERY_SCRIPT"
[ -f "$TARGET_CERT" ] && [ ! -L "$TARGET_CERT" ] || exit 1
[ -f "$TARGET_KEY" ] && [ ! -L "$TARGET_KEY" ] || exit 1
[ "$TEST_FAILURE" != none ] || {
  [ "$(stat -c %u "$TARGET_CERT")" -eq 0 ] && [ "$(stat -c %a "$TARGET_CERT")" = 644 ] || exit 1
  [ "$(stat -c %u "$TARGET_KEY")" -eq 0 ] && [ "$(stat -c %a "$TARGET_KEY")" = 600 ] || exit 1
}

openssl x509 -in "$SOURCE_CERT" -noout -checkend 604800 >/dev/null
openssl x509 -in "$SOURCE_CERT" -noout -checkhost smtp.asodef.com.co >/dev/null
cert_public=$(openssl x509 -in "$SOURCE_CERT" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
key_public=$(openssl pkey -in "$SOURCE_KEY" -pubout -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
[ -n "$cert_public" ] && [ "$cert_public" = "$key_public" ] || exit 1

mkdir -m 0700 "$TRANSACTION_DIR"
install -m 0644 "$TARGET_CERT" "$TRANSACTION_DIR/previous-fullchain.pem"
install -m 0600 "$TARGET_KEY" "$TRANSACTION_DIR/previous-privkey.pem"
install -m 0644 "$SOURCE_CERT" "$TRANSACTION_DIR/new-fullchain.pem"
install -m 0600 "$SOURCE_KEY" "$TRANSACTION_DIR/new-privkey.pem"
printf 'state=SWITCHING\n' > "$TRANSACTION_DIR/state"

rollback_pending() {
  if [ -d "$TRANSACTION_DIR" ]; then
    if "$RECOVERY_SCRIPT" >/dev/null 2>&1; then
      if [ "$TEST_FAILURE" = none ] && [ "$(systemctl is-active postfix 2>/dev/null || true)" = active ]; then
        systemctl reload postfix >/dev/null 2>&1 || systemctl stop postfix >/dev/null 2>&1 || true
      fi
    elif [ "$TEST_FAILURE" = none ]; then
      systemctl stop postfix >/dev/null 2>&1 || true
    fi
  fi
}
trap rollback_pending EXIT HUP INT TERM

mv "$TRANSACTION_DIR/new-fullchain.pem" "$TARGET_CERT"
mv "$TRANSACTION_DIR/new-privkey.pem" "$TARGET_KEY"

[ "$TEST_FAILURE" != check ] || false
if [ "$TEST_FAILURE" = none ]; then postfix check; fi
[ "$TEST_FAILURE" != reload ] || false
if [ "$TEST_FAILURE" = none ]; then
  [ "$(systemctl is-active postfix 2>/dev/null || true)" = active ]
  systemctl reload postfix
fi
[ "$TEST_FAILURE" != live ] || false
if [ "$TEST_FAILURE" = none ]; then
  live_session=$(timeout 15 openssl s_client -starttls smtp -connect 127.0.0.1:25 -servername smtp.asodef.com.co -verify_hostname smtp.asodef.com.co -verify_return_error </dev/null 2>/dev/null)
  printf '%s\n' "$live_session" | grep -F 'Verify return code: 0 (ok)' >/dev/null
  live_cert=$(printf '%s\n' "$live_session" | openssl x509 -outform DER | sha256sum | awk '{print $1}')
  source_cert=$(openssl x509 -in "$SOURCE_CERT" -outform DER | sha256sum | awk '{print $1}')
  [ -n "$live_cert" ] && [ "$live_cert" = "$source_cert" ]
fi

rm -rf "$TRANSACTION_DIR"
trap - EXIT HUP INT TERM
echo 'status=ok component=postfix certificate=installed_reload_and_live_starttls_verified'
