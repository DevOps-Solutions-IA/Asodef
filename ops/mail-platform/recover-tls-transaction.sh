#!/usr/bin/env sh
set -eu

if [ "${ASODEF_MAIL_TLS_TEST_MODE:-NO}" = YES ] && [ "$(id -u)" -ne 0 ]; then
  TARGET_DIR=${ASODEF_MAIL_TLS_TEST_TARGET_DIR:?}
else
  [ "$(id -u)" -eq 0 ] || exit 1
  TARGET_DIR=/etc/postfix/tls
fi

TRANSACTION_DIR=$TARGET_DIR/.renewal-transaction
TARGET_CERT=$TARGET_DIR/fullchain.pem
TARGET_KEY=$TARGET_DIR/privkey.pem
[ -e "$TRANSACTION_DIR" ] || exit 0
[ -d "$TRANSACTION_DIR" ] && [ ! -L "$TRANSACTION_DIR" ] || exit 1
[ "${ASODEF_MAIL_TLS_TEST_MODE:-NO}" = YES ] || {
  [ "$(stat -c %u "$TRANSACTION_DIR")" -eq 0 ] && [ "$(stat -c %a "$TRANSACTION_DIR")" = 700 ] || exit 1
}
[ -f "$TRANSACTION_DIR/previous-fullchain.pem" ] || exit 1
[ -f "$TRANSACTION_DIR/previous-privkey.pem" ] || exit 1

previous_cert_public=$(openssl x509 -in "$TRANSACTION_DIR/previous-fullchain.pem" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
previous_key_public=$(openssl pkey -in "$TRANSACTION_DIR/previous-privkey.pem" -pubout -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
[ -n "$previous_cert_public" ] && [ "$previous_cert_public" = "$previous_key_public" ] || exit 1
install -m 0644 "$TRANSACTION_DIR/previous-fullchain.pem" "$TARGET_CERT"
install -m 0600 "$TRANSACTION_DIR/previous-privkey.pem" "$TARGET_KEY"
cert_public=$(openssl x509 -in "$TARGET_CERT" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
key_public=$(openssl pkey -in "$TARGET_KEY" -pubout -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
[ -n "$cert_public" ] && [ "$cert_public" = "$key_public" ] || exit 1
rm -rf "$TRANSACTION_DIR"
echo 'status=ok tls_transaction=recovered_previous_pair'
