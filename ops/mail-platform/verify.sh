#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

load_config "${1:-}"
require_root
require_secure_config "$1"
require_secure_password_file
for mail_command in postfix postconf postmap postqueue sasldblistusers2 opendkim-testkey openssl ss ufw journalctl python3; do require_command "$mail_command"; done

postfix check
[ "$(systemctl is-active postfix)" = active ] || die postfix_inactive
[ "$(systemctl is-active opendkim)" = active ] || die opendkim_inactive
postconf -h smtpd_relay_restrictions | grep -F 'reject_unauth_destination' >/dev/null || die open_relay_guard_missing
[ -z "$(postconf -h mynetworks)" ] || die trusted_network_relay_not_allowed
postconf -h smtpd_relay_restrictions | grep -F 'permit_mynetworks' >/dev/null && die trusted_network_relay_not_allowed
[ "$(postconf -h authorized_submit_users)" = root ] || die local_sendmail_users_not_restricted
postconf -M "$MAIL_LISTEN_ADDRESS:submission/inet" >/dev/null || die submission_service_missing
[ "$(postconf -Ph "$MAIL_LISTEN_ADDRESS:submission/inet/smtpd_sasl_auth_enable" 2>/dev/null)" = yes ] || die submission_auth_missing
[ "$(postconf -Ph "$MAIL_LISTEN_ADDRESS:submission/inet/milter_macro_daemon_name" 2>/dev/null)" = ORIGINATING ] || die dkim_originating_macro_missing
postmap -q "$MAIL_SMTP_FROM" hash:/etc/postfix/sender_login | grep -Fx "$MAIL_SMTP_USER@$MAIL_DOMAIN" >/dev/null || die sender_login_map_mismatch
sasldblistusers2 2>/dev/null | grep -F "$MAIL_SMTP_USER@$MAIL_DOMAIN:" >/dev/null || die sasl_identity_missing
grep -Eq '^[[:space:]]*MTA[[:space:]]+ORIGINATING[[:space:]]*$' /etc/opendkim.conf || die dkim_originating_mta_missing
grep -Fx "$MAIL_API_ADDRESS" /etc/opendkim/trusted.hosts >/dev/null || die dkim_private_api_host_missing
grep -F "*@$MAIL_DOMAIN" /etc/opendkim/signing.table >/dev/null || die dkim_signing_table_missing
opendkim-testkey -d "$MAIL_DOMAIN" -s "$MAIL_DKIM_SELECTOR" -vv >/dev/null 2>&1 || die dkim_verify_failed
postqueue -p >/dev/null

ss -lnt | awk '{print $4}' | grep -Fx "$MAIL_LISTEN_ADDRESS:587" >/dev/null || die submission_not_listening_private
ss -lnt | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\[::\]|\*):(25|587)$' && die public_mail_listener_exposed
ss -lnt | awk '{print $4}' | grep -Eq "^$MAIL_PUBLIC_IPV4:(25|587)$" && die public_mail_listener_exposed
ss -lnt | awk '{print $4}' | grep -Eq '(^|:)465$' && die implicit_smtps_exposed

require_secure_root_file /var/lib/asodef-mail-platform-ufw-state ufw_state
for mail_comment in 'ASODEF API SMTP submission exact source' 'ASODEF inbound SMTP direct delivery' 'DENY legacy implicit SMTPS' 'DENY public ASODEF SMTP submission'; do
  ufw status numbered | grep -F "$mail_comment" >/dev/null || die managed_firewall_rule_missing
done
openssl s_client -starttls smtp -connect "$MAIL_LISTEN_ADDRESS:587" -servername "$MAIL_HOSTNAME" -verify_hostname "$MAIL_HOSTNAME" </dev/null 2>/dev/null | grep -F 'Verify return code: 0 (ok)' >/dev/null || die starttls_verify_failed

journalctl --quiet -u postfix -u opendkim --since '-24 hours' --no-pager | \
  python3 "$SCRIPT_DIR/scan-mail-logs.py" --password-file "$MAIL_SMTP_PASSWORD_FILE"

echo 'status=ok relay=restricted tls=verified dkim=verified secrets_logged=no'
