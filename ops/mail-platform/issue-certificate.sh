#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -eq 1 ] || die usage_certificate_config
load_config "$1"
require_root
require_secure_config "$1"
require_approval
[ "${MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS:-NO}" = YES ] || die certificate_issuance_disabled_existing_certificate_must_be_adopted
require_command certbot
require_command dig

mail_a=$(dig +short A "$MAIL_HOSTNAME" | grep -Fx "$MAIL_PUBLIC_IPV4" || true)
[ -n "$mail_a" ] || die dns_a_mismatch
[ -d "$MAIL_ACME_WEBROOT" ] || die acme_webroot_missing

certbot certonly --webroot -w "$MAIL_ACME_WEBROOT" -d "$MAIL_HOSTNAME" \
  --non-interactive --agree-tos --no-eff-email --email "$MAIL_ACME_EMAIL"
RENEWED_LINEAGE="/etc/letsencrypt/live/$MAIL_HOSTNAME" "$SCRIPT_DIR/cert-renew-hook.sh"
openssl x509 -in "$MAIL_TLS_CERT_FILE" -noout -checkend 604800 >/dev/null || die certificate_expiring
openssl x509 -in "$MAIL_TLS_CERT_FILE" -noout -checkhost "$MAIL_HOSTNAME" >/dev/null || die certificate_hostname_mismatch
echo 'status=ok certificate=public hostname=verified renewal=certbot-managed'
