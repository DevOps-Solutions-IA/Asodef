#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die usage_reconcile_config_mode
CONFIG_PATH=$1
MODE=${2:---report}
case "$MODE" in --report|--pre-apply) : ;; *) die invalid_reconcile_mode ;; esac

load_config "$CONFIG_PATH"
require_root
require_secure_config "$CONFIG_PATH"
for mail_command in postfix postconf openssl sha256sum ss grep stat awk; do require_command "$mail_command"; done

[ "$MAIL_DKIM_SELECTOR" = asodef2026 ] || die certified_dkim_selector_mismatch
[ "$MAIL_TLS_CERT_FILE" = /etc/postfix/tls/fullchain.pem ] || die certified_tls_certificate_path_mismatch
[ "$MAIL_TLS_KEY_FILE" = /etc/postfix/tls/privkey.pem ] || die certified_tls_key_path_mismatch

DKIM_PRIVATE="/etc/opendkim/keys/$MAIL_DOMAIN/$MAIL_DKIM_SELECTOR.private"
[ -f "$DKIM_PRIVATE" ] && [ ! -L "$DKIM_PRIVATE" ] || die certified_dkim_private_key_missing
[ "$(stat -c %a "$DKIM_PRIVATE")" = 600 ] || die certified_dkim_private_key_mode
[ "$(stat -c %U "$DKIM_PRIVATE")" = opendkim ] || die certified_dkim_private_key_owner
[ -r "$MAIL_TLS_CERT_FILE" ] && [ -r "$MAIL_TLS_KEY_FILE" ] || die certified_tls_material_missing
[ ! -L "$MAIL_TLS_CERT_FILE" ] && [ ! -L "$MAIL_TLS_KEY_FILE" ] || die certified_tls_material_must_be_regular
[ "$(stat -c %u "$MAIL_TLS_CERT_FILE")" -eq 0 ] && [ "$(stat -c %a "$MAIL_TLS_CERT_FILE")" = 644 ] || die certified_tls_certificate_permissions
[ "$(stat -c %u "$MAIL_TLS_KEY_FILE")" -eq 0 ] && [ "$(stat -c %a "$MAIL_TLS_KEY_FILE")" = 600 ] || die certified_tls_key_permissions

openssl x509 -in "$MAIL_TLS_CERT_FILE" -noout -checkend 604800 >/dev/null || die certified_tls_certificate_expiring
openssl x509 -in "$MAIL_TLS_CERT_FILE" -noout -checkhost "$MAIL_HOSTNAME" >/dev/null || die certified_tls_hostname_mismatch
mail_cert_public=$(openssl x509 -in "$MAIL_TLS_CERT_FILE" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
mail_key_public=$(openssl pkey -in "$MAIL_TLS_KEY_FILE" -pubout -outform DER 2>/dev/null | sha256sum | awk '{print $1}')
[ -n "$mail_cert_public" ] && [ "$mail_cert_public" = "$mail_key_public" ] || die certified_tls_key_mismatch

[ "$(postconf -h myhostname)" = "$MAIL_HOSTNAME" ] || die runtime_mail_hostname_mismatch
mail_key_table=$(awk 'tolower($1) == "keytable" { sub(/^refile:/, "", $2); print $2; exit }' /etc/opendkim.conf)
mail_signing_table=$(awk 'tolower($1) == "signingtable" { sub(/^refile:/, "", $2); print $2; exit }' /etc/opendkim.conf)
[ -n "$mail_key_table" ] && [ -f "$mail_key_table" ] || die runtime_dkim_key_table_missing
[ -n "$mail_signing_table" ] && [ -f "$mail_signing_table" ] || die runtime_dkim_signing_table_missing
grep -F "$MAIL_DKIM_SELECTOR._domainkey.$MAIL_DOMAIN" "$mail_key_table" >/dev/null || die runtime_dkim_selector_mismatch
grep -F ":$DKIM_PRIVATE" "$mail_key_table" >/dev/null || die runtime_dkim_key_path_mismatch
grep -F "$MAIL_DKIM_SELECTOR._domainkey.$MAIL_DOMAIN" "$mail_signing_table" >/dev/null || die runtime_dkim_signing_selector_mismatch

mail_public_submission=$(ss -lntH | awk -v public="$MAIL_PUBLIC_IPV4" '
  {
    address=$4
    if (address ~ /:587$/ && (address ~ /^(0\.0\.0\.0|\[::\]|\*):/ || index(address, public ":") == 1)) print address
  }
' | head -n 1)
[ -z "$mail_public_submission" ] || die public_submission_listener_detected

mail_plan='none'
append_plan() {
  if [ "$mail_plan" = none ]; then mail_plan=$1; else mail_plan="$mail_plan,$1"; fi
}
[ "$(postconf -h inet_protocols)" = ipv4 ] || append_plan enforce_ipv4
[ "$(postconf -h inet_interfaces)" = "127.0.0.1, $MAIL_LISTEN_ADDRESS" ] || append_plan restrict_inet_interfaces
[ -z "$(postconf -h mynetworks)" ] || append_plan clear_trusted_relay_networks
postconf -h smtpd_relay_restrictions | grep -F permit_mynetworks >/dev/null && append_plan remove_permit_mynetworks || :
postconf -h smtpd_relay_restrictions | grep -F reject_unauth_destination >/dev/null || append_plan enforce_relay_destination_guard
postconf -h smtpd_sender_restrictions | grep -F reject_authenticated_sender_login_mismatch >/dev/null || append_plan enforce_sender_login_ownership
[ "$(postconf -h smtpd_tls_mandatory_protocols)" = '>=TLSv1.2' ] || append_plan enforce_submission_tls_minimum
[ "$(postconf -h smtpd_tls_cert_file)" = "$MAIL_TLS_CERT_FILE" ] || append_plan adopt_postfix_tls_certificate_path
[ "$(postconf -h smtpd_tls_key_file)" = "$MAIL_TLS_KEY_FILE" ] || append_plan adopt_postfix_tls_key_path
[ -f /etc/postfix/main.cf ] && grep -q '^# ASODEF MAIL PLATFORM MANAGED$' /etc/postfix/main.cf || append_plan adopt_postfix_main
grep -q '^# BEGIN ASODEF SUBMISSION$' /etc/postfix/master.cf 2>/dev/null || append_plan add_private_submission
[ -f /etc/postfix/sasl/smtpd.conf ] || append_plan provision_sasl_policy
[ -f /etc/sasldb2 ] || append_plan provision_application_sasl_identity

printf 'status=ok mode=%s runtime=adoptable dkim_selector=%s dkim_key=preserved tls_identity=verified public_587=absent planned_changes=%s\n' \
  "$MODE" "$MAIL_DKIM_SELECTOR" "$mail_plan"
