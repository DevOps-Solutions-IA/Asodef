#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -eq 2 ] || die usage_apply_config_stage
CONFIG_PATH=$1
STAGE=$2
load_config "$CONFIG_PATH"
require_root
require_secure_config "$CONFIG_PATH"
require_secure_password_file
require_approval

case "$STAGE" in
  --prepare|--activate) : ;;
  *) die invalid_stage ;;
esac

if [ "$STAGE" = "--activate" ]; then
  [ -f /var/lib/asodef-mail-platform-last-backup ] || die prepare_stage_not_completed
  mail_original_backup=$(cat /var/lib/asodef-mail-platform-last-backup)
  case "$mail_original_backup" in /var/backups/asodef-mail-platform/*) : ;; *) die invalid_backup_pointer ;; esac
  [ -f "$mail_original_backup/prepared.ok" ] || die prepare_stage_incomplete
  grep -q '^# ASODEF MAIL PLATFORM MANAGED$' /etc/postfix/main.cf || die managed_config_missing
  "$SCRIPT_DIR/preflight.sh" "$CONFIG_PATH"
  postfix check
  opendkim-testkey -d "$MAIL_DOMAIN" -s "$MAIL_DKIM_SELECTOR" -vv >/dev/null 2>&1 || die dkim_dns_not_verified
  systemctl enable opendkim postfix
  systemctl restart opendkim
  systemctl restart postfix
  echo 'status=activated'
  exit 0
fi

if [ -f /etc/postfix/main.cf ] && grep -q '^# ASODEF MAIL PLATFORM MANAGED$' /etc/postfix/main.cf; then
  die already_prepared_rollback_or_activate
fi

BACKUP_ROOT=/var/backups/asodef-mail-platform
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
install -d -o root -g root -m 0700 "$BACKUP_DIR"
install -d -o root -g root -m 0700 "$BACKUP_DIR/original"
for mail_path in \
  /etc/postfix/main.cf /etc/postfix/master.cf /etc/postfix/sender_login /etc/postfix/sender_login.db \
  /etc/postfix/sasl/smtpd.conf /etc/opendkim.conf /etc/opendkim/key.table \
  /etc/opendkim/signing.table /etc/opendkim/trusted.hosts /etc/sasldb2 \
  /etc/letsencrypt/renewal-hooks/deploy/asodef-postfix-mail \
  "/etc/opendkim/keys/$MAIL_DOMAIN/$MAIL_DKIM_SELECTOR.private" \
  "/etc/opendkim/keys/$MAIL_DOMAIN/$MAIL_DKIM_SELECTOR.txt"; do
  [ ! -e "$mail_path" ] || cp -a --parents "$mail_path" "$BACKUP_DIR/original"
done
{
  printf 'postfix_active=%s\n' "$(systemctl is-active postfix 2>/dev/null || true)"
  printf 'postfix_enabled=%s\n' "$(systemctl is-enabled postfix 2>/dev/null || true)"
  printf 'opendkim_active=%s\n' "$(systemctl is-active opendkim 2>/dev/null || true)"
  printf 'opendkim_enabled=%s\n' "$(systemctl is-enabled opendkim 2>/dev/null || true)"
} > "$BACKUP_DIR/service-state"
chmod 0600 "$BACKUP_DIR/service-state"
mail_pointer_tmp="/var/lib/asodef-mail-platform-last-backup.tmp.$$"
printf '%s\n' "$BACKUP_DIR" > "$mail_pointer_tmp"
chmod 0600 "$mail_pointer_tmp"
mv "$mail_pointer_tmp" /var/lib/asodef-mail-platform-last-backup

export DEBIAN_FRONTEND=noninteractive
mail_policy_created=NO
cleanup_policy() {
  if [ "$mail_policy_created" = YES ]; then rm -f /usr/sbin/policy-rc.d; fi
}
trap cleanup_policy EXIT HUP INT TERM
if [ ! -e /usr/sbin/policy-rc.d ]; then
  printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
  chmod 0755 /usr/sbin/policy-rc.d
  mail_policy_created=YES
fi
apt-get update
apt-get install -y --no-install-recommends postfix opendkim opendkim-tools sasl2-bin libsasl2-modules swaks
systemctl stop postfix opendkim || true
cleanup_policy
mail_policy_created=NO

install -d -o root -g root -m 0755 /etc/postfix/sasl
install -d -o root -g root -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -d -o opendkim -g opendkim -m 0750 "/etc/opendkim/keys/$MAIL_DOMAIN"

render_template "$SCRIPT_DIR/config/postfix-main.cf.template" /etc/postfix/main.cf
render_template "$SCRIPT_DIR/config/opendkim.conf.template" /etc/opendkim.conf
render_template "$SCRIPT_DIR/config/key.table.template" /etc/opendkim/key.table
render_template "$SCRIPT_DIR/config/signing.table.template" /etc/opendkim/signing.table
render_template "$SCRIPT_DIR/config/trusted.hosts.template" /etc/opendkim/trusted.hosts
install -o root -g root -m 0644 "$SCRIPT_DIR/config/smtpd.conf.template" /etc/postfix/sasl/smtpd.conf
install -o root -g root -m 0755 "$SCRIPT_DIR/cert-renew-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/asodef-postfix-mail

MASTER_FRAGMENT="$BACKUP_DIR/rendered-master.cf.fragment"
render_template "$SCRIPT_DIR/config/postfix-master.cf.fragment.template" "$MASTER_FRAGMENT"
grep -q '@@' "$MASTER_FRAGMENT" && die unresolved_master_fragment_variable
if ! grep -q '^# BEGIN ASODEF SUBMISSION$' /etc/postfix/master.cf; then
  {
    printf '\n# BEGIN ASODEF SUBMISSION\n'
    cat "$MASTER_FRAGMENT"
    printf '# END ASODEF SUBMISSION\n'
  } >> /etc/postfix/master.cf
fi

printf '%s %s@%s\n' "$MAIL_SMTP_FROM" "$MAIL_SMTP_USER" "$MAIL_DOMAIN" > /etc/postfix/sender_login
postmap /etc/postfix/sender_login
chown root:postfix /etc/postfix/sender_login /etc/postfix/sender_login.db
chmod 0640 /etc/postfix/sender_login /etc/postfix/sender_login.db

mail_password=$(cat "$MAIL_SMTP_PASSWORD_FILE")
[ -n "$mail_password" ] || die password_file_empty
printf '%s' "$mail_password" | saslpasswd2 -p -c -u "$MAIL_DOMAIN" "$MAIL_SMTP_USER"
unset mail_password
chown root:postfix /etc/sasldb2
chmod 0640 /etc/sasldb2

KEY_DIR="/etc/opendkim/keys/$MAIL_DOMAIN"
if [ ! -f "$KEY_DIR/$MAIL_DKIM_SELECTOR.private" ]; then
  opendkim-genkey -b 2048 -D "$KEY_DIR" -d "$MAIL_DOMAIN" -s "$MAIL_DKIM_SELECTOR"
fi
chown -R opendkim:opendkim "$KEY_DIR"
chmod 0750 "$KEY_DIR"
chmod 0600 "$KEY_DIR/$MAIL_DKIM_SELECTOR.private"
chmod 0644 "$KEY_DIR/$MAIL_DKIM_SELECTOR.txt"

postfix check
systemctl stop postfix opendkim
printf 'prepared_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_DIR/prepared.ok"
chmod 0600 "$BACKUP_DIR/prepared.ok"
echo "status=prepared services=stopped dkim_dns_file=$KEY_DIR/$MAIL_DKIM_SELECTOR.txt"
