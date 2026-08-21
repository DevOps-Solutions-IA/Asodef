#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for mail_script in "$SCRIPT_DIR"/*.sh; do sh -n "$mail_script"; done

required='README.md mail-platform.env.example preflight.sh reconcile-runtime.sh inventory-mail-queue.sh recover-tls-transaction.sh verify-dns.sh apply.sh configure-firewall.sh verify.sh test-relay-security.sh authorized-negative-tests.py scan-mail-logs.py validate-network-contract.py check-network-overlap.py validate-dns-policy.py create-mail-network.sh verify-mail-network.sh rollback-mail-network.sh docker-compose.mail-platform.yml issue-certificate.sh rotate-dkim.sh cert-renew-hook.sh test-cert-renew-hook.py rollback.sh config/postfix-tls-recovery.conf'
for mail_file in $required; do [ -f "$SCRIPT_DIR/$mail_file" ] || { echo "missing=$mail_file" >&2; exit 1; }; done

grep -F 'reject_unauth_destination' "$SCRIPT_DIR/config/postfix-main.cf.template" >/dev/null
grep -F 'mynetworks =' "$SCRIPT_DIR/config/postfix-main.cf.template" >/dev/null
grep -Fx 'inet_protocols = ipv4' "$SCRIPT_DIR/config/postfix-main.cf.template" >/dev/null
grep -F 'authorized_submit_users = root' "$SCRIPT_DIR/config/postfix-main.cf.template" >/dev/null
if grep -F 'permit_mynetworks' "$SCRIPT_DIR/config/postfix-main.cf.template" >/dev/null; then
  echo 'trusted_network_relay_scan=FAIL' >&2
  exit 1
fi
grep -F 'smtpd_tls_security_level=encrypt' "$SCRIPT_DIR/config/postfix-master.cf.fragment.template" >/dev/null
grep -F '@@MAIL_LISTEN_ADDRESS@@:submission' "$SCRIPT_DIR/config/postfix-master.cf.fragment.template" >/dev/null
grep -Eq '^[[:space:]]*MTA[[:space:]]+ORIGINATING[[:space:]]*$' "$SCRIPT_DIR/config/opendkim.conf.template"
grep -F 'milter_macro_daemon_name=ORIGINATING' "$SCRIPT_DIR/config/postfix-master.cf.fragment.template" >/dev/null
grep -F '@@MAIL_API_ADDRESS@@' "$SCRIPT_DIR/config/trusted.hosts.template" >/dev/null
grep -F '*@@@MAIL_DOMAIN@@' "$SCRIPT_DIR/config/signing.table.template" >/dev/null
grep -F 'reject_authenticated_sender_login_mismatch' "$SCRIPT_DIR/config/postfix-main.cf.template" >/dev/null
grep -F '127.0.0.1' "$SCRIPT_DIR/test-relay-security.sh" >/dev/null
grep -F 'MAIL_OPERATOR_APPROVAL=NO' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_NETWORK_NAME=asodef_mail_submission' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_DKIM_SELECTOR=asodef2026' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_TLS_CERT_FILE=/etc/postfix/tls/fullchain.pem' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_TLS_KEY_FILE=/etc/postfix/tls/privkey.pem' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_ACME_WEBROOT=/opt/asodef/public-platform/shared/acme-webroot' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_SMTP_USER=asodef-api' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS=NO' "$SCRIPT_DIR/mail-platform.env.example" >/dev/null
grep -F 'certificate_issuance_disabled_existing_certificate_must_be_adopted' "$SCRIPT_DIR/issue-certificate.sh" >/dev/null
grep -F 'certified_dkim_private_key_missing' "$SCRIPT_DIR/reconcile-runtime.sh" >/dev/null
grep -F 'operator_quarantine_review_required' "$SCRIPT_DIR/inventory-mail-queue.sh" >/dev/null
mail_backup_line=$(grep -n 'mv "$mail_pointer_tmp" /var/lib/asodef-mail-platform-last-backup' "$SCRIPT_DIR/apply.sh" | cut -d: -f1)
mail_stop_line=$(grep -n '^systemctl stop postfix$' "$SCRIPT_DIR/apply.sh" | head -n 1 | cut -d: -f1)
mail_queue_lines=$(grep -n 'inventory-mail-queue.sh' "$SCRIPT_DIR/apply.sh" | cut -d: -f1)
mail_activate_queue_line=$(printf '%s\n' "$mail_queue_lines" | head -n 1)
mail_prepare_queue_line=$(printf '%s\n' "$mail_queue_lines" | tail -n 1)
mail_activate_restart_line=$(grep -n '^  systemctl restart postfix$' "$SCRIPT_DIR/apply.sh" | cut -d: -f1)
[ "$mail_backup_line" -lt "$mail_stop_line" ] && [ "$mail_stop_line" -lt "$mail_prepare_queue_line" ] || {
  echo 'queue_freeze_order=FAIL' >&2
  exit 1
}
[ "$mail_activate_queue_line" -lt "$mail_activate_restart_line" ] || {
  echo 'queue_activation_recheck_order=FAIL' >&2
  exit 1
}
grep -F '/etc/opendkim/KeyTable' "$SCRIPT_DIR/apply.sh" >/dev/null
grep -F '/etc/opendkim/KeyTable' "$SCRIPT_DIR/rollback.sh" >/dev/null
grep -F 'MAIL_TLS_CERT_FILE' "$SCRIPT_DIR/apply.sh" >/dev/null
grep -F 'MAIL_TLS_CERT_FILE' "$SCRIPT_DIR/rollback.sh" >/dev/null
grep -F 'sha256sum' "$SCRIPT_DIR/cert-renew-hook.sh" >/dev/null
grep -F 'TRANSACTION_DIR=$TARGET_DIR/.renewal-transaction' "$SCRIPT_DIR/cert-renew-hook.sh" >/dev/null
grep -F 'Verify return code: 0 (ok)' "$SCRIPT_DIR/cert-renew-hook.sh" >/dev/null
grep -F 'live_cert' "$SCRIPT_DIR/cert-renew-hook.sh" >/dev/null
grep -F 'ExecStartPre=/usr/local/sbin/asodef-mail-tls-recover' "$SCRIPT_DIR/config/postfix-tls-recovery.conf" >/dev/null
if grep -F 'opendkim-genkey' "$SCRIPT_DIR/apply.sh" >/dev/null; then
  echo 'dkim_adoption_policy=FAIL' >&2
  exit 1
fi
if grep -F 'chown -R' "$SCRIPT_DIR/apply.sh" >/dev/null; then
  echo 'dkim_minimum_ownership_scope=FAIL' >&2
  exit 1
fi
grep -F 'if [ ! -d "$mail_parent" ]' "$SCRIPT_DIR/rollback.sh" >/dev/null
if grep -F '[::1]' "$SCRIPT_DIR/config/postfix-main.cf.template" "$SCRIPT_DIR/config/trusted.hosts.template" >/dev/null; then
  echo 'ipv4_only_contract=FAIL' >&2
  exit 1
fi
python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$SCRIPT_DIR/authorized-negative-tests.py"
python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$SCRIPT_DIR/scan-mail-logs.py"
for mail_python in "$SCRIPT_DIR"/*.py; do
  python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$mail_python"
done
python3 "$SCRIPT_DIR/test-cert-renew-hook.py"
python3 "$SCRIPT_DIR/validate-dns-policy.py" --public-ip 192.0.2.10 \
  --spf 'v=spf1 ip4:192.0.2.10 include:secureserver.net -all' \
  --dmarc 'v=DMARC1; p=quarantine; adkim=r; aspf=r;' >/dev/null
if python3 "$SCRIPT_DIR/validate-dns-policy.py" --public-ip 192.0.2.10 \
  --spf 'v=spf1 include:secureserver.net -all' --dmarc 'v=DMARC1; p=reject;' >/dev/null 2>&1; then
  echo 'dns_policy_negative_test=FAIL' >&2
  exit 1
fi

if grep -RIE --exclude='test-artifacts.sh' '(BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|SMTP_PASSWORD=[^[:space:]]+|p=[A-Za-z0-9+/]{32,})' "$SCRIPT_DIR"; then
  echo 'secret_scan=FAIL' >&2
  exit 1
fi

if grep -RIE 'smtpd_(relay|recipient)_restrictions[[:space:]]*=.*permit[[:space:]]*$' "$SCRIPT_DIR/config"; then
  echo 'relay_policy_scan=FAIL' >&2
  exit 1
fi

mail_firewall=$($SCRIPT_DIR/configure-firewall.sh "$SCRIPT_DIR/tests/mail-platform.test.env" --dry-run)
printf '%s\n' "$mail_firewall" | grep -F 'allow in on asodef-mail-test0 from 198.51.100.2 to 198.51.100.1 port 587' >/dev/null
printf '%s\n' "$mail_firewall" | grep -F 'deny in on eth0 to 192.0.2.10 port 25' >/dev/null
printf '%s\n' "$mail_firewall" | grep -F 'deny in on eth0 to 192.0.2.10 port 465' >/dev/null
printf '%s\n' "$mail_firewall" | grep -F 'deny in on eth0 to 192.0.2.10 port 587' >/dev/null
grep -F 'asodef-mail-platform-ufw-state' "$SCRIPT_DIR/configure-firewall.sh" >/dev/null
grep -Fq -- '--attachment-only' "$SCRIPT_DIR/verify-mail-network.sh"
grep -F 'delete_owned_comment' "$SCRIPT_DIR/rollback.sh" >/dev/null
if printf '%s\n' "$mail_firewall" | grep -E 'allow .*port (25|465)' >/dev/null; then
  echo 'firewall_policy_scan=FAIL' >&2
  exit 1
fi

. "$SCRIPT_DIR/lib.sh"
load_config "$SCRIPT_DIR/tests/mail-platform.test.env"
mail_stage=$(mktemp -d)
cleanup_stage() { rm -rf "$mail_stage"; }
trap cleanup_stage EXIT HUP INT TERM
for mail_template in "$SCRIPT_DIR"/config/*.template; do
  render_template "$mail_template" "$mail_stage/$(basename "$mail_template" .template)"
done
if grep -R '@@' "$mail_stage" >/dev/null; then
  echo 'template_staging_placeholders=FAIL' >&2
  exit 1
fi
grep -F '198.51.100.1:submission' "$mail_stage/postfix-master.cf.fragment" >/dev/null
grep -Fx 'inet_protocols = ipv4' "$mail_stage/postfix-main.cf" >/dev/null
grep -Eq '^[[:space:]]*MTA[[:space:]]+ORIGINATING[[:space:]]*$' "$mail_stage/opendkim.conf"
grep -Fx '198.51.100.2' "$mail_stage/trusted.hosts" >/dev/null
cleanup_stage
trap - EXIT HUP INT TERM

echo 'status=ok shell_syntax=pass secret_scan=pass relay_policy=restricted firewall_policy=exact template_staging=pass dkim_originating=explicit'
