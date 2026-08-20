#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for mail_script in "$SCRIPT_DIR"/*.sh; do sh -n "$mail_script"; done

required='README.md mail-platform.env.example preflight.sh verify-dns.sh apply.sh configure-firewall.sh verify.sh test-relay-security.sh authorized-negative-tests.py scan-mail-logs.py validate-network-contract.py check-network-overlap.py validate-dns-policy.py create-mail-network.sh verify-mail-network.sh rollback-mail-network.sh docker-compose.mail-platform.yml issue-certificate.sh rotate-dkim.sh cert-renew-hook.sh rollback.sh'
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
python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$SCRIPT_DIR/authorized-negative-tests.py"
python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$SCRIPT_DIR/scan-mail-logs.py"
for mail_python in "$SCRIPT_DIR"/*.py; do
  python3 -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$mail_python"
done
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
