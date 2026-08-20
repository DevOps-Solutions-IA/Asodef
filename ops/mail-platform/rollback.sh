#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -eq 1 ] || die usage_rollback_config
load_config "$1"
require_root
require_secure_config "$1"
require_approval

systemctl stop postfix opendkim || true
[ -f /var/lib/asodef-mail-platform-last-backup ] || die backup_pointer_missing
BACKUP_DIR=$(cat /var/lib/asodef-mail-platform-last-backup)
case "$BACKUP_DIR" in /var/backups/asodef-mail-platform/*) : ;; *) die invalid_backup_pointer ;; esac
[ -d "$BACKUP_DIR" ] || die backup_directory_missing
[ -f "$BACKUP_DIR/service-state" ] || die service_state_missing
install -d -o root -g root -m 0700 "$BACKUP_DIR/retired"

STATE_FILE=/var/lib/asodef-mail-platform-ufw-state
if [ -e "$STATE_FILE" ]; then
  require_secure_root_file "$STATE_FILE" ufw_state
  delete_owned_comment() {
    mail_number=$(ufw status numbered | awk -v needle="$1" 'index($0, needle) { line=$0; sub(/^[[:space:]]*\[[[:space:]]*/, "", line); sub(/\].*$/, "", line); gsub(/[[:space:]]/, "", line); print line; exit }')
    [ -z "$mail_number" ] || ufw --force delete "$mail_number" >/dev/null
  }
  delete_owned_comment 'DENY public ASODEF SMTP submission'
  delete_owned_comment 'DENY legacy implicit SMTPS'
  delete_owned_comment 'ASODEF inbound SMTP direct delivery'
  delete_owned_comment 'ASODEF API SMTP submission exact source'
  mv "$STATE_FILE" "$BACKUP_DIR/retired/ufw-state"
fi

restore_path() {
  mail_live_path=$1
  mail_original_path="$BACKUP_DIR/original$mail_live_path"
  if [ -e "$mail_live_path" ]; then
    cp -a --parents "$mail_live_path" "$BACKUP_DIR/retired"
    rm -f "$mail_live_path"
  fi
  if [ -e "$mail_original_path" ]; then
    install -d -o root -g root -m 0755 "$(dirname "$mail_live_path")"
    cp -a "$mail_original_path" "$mail_live_path"
  fi
}

for mail_path in \
  /etc/postfix/main.cf /etc/postfix/master.cf /etc/postfix/sender_login /etc/postfix/sender_login.db \
  /etc/postfix/sasl/smtpd.conf /etc/opendkim.conf /etc/opendkim/key.table \
  /etc/opendkim/signing.table /etc/opendkim/trusted.hosts /etc/sasldb2 \
  /etc/letsencrypt/renewal-hooks/deploy/asodef-postfix-mail \
  "/etc/opendkim/keys/$MAIL_DOMAIN/$MAIL_DKIM_SELECTOR.private" \
  "/etc/opendkim/keys/$MAIL_DOMAIN/$MAIL_DKIM_SELECTOR.txt"; do
  restore_path "$mail_path"
done

restore_service() {
  mail_service=$1
  mail_active=$(sed -n "s/^${mail_service}_active=//p" "$BACKUP_DIR/service-state")
  mail_enabled=$(sed -n "s/^${mail_service}_enabled=//p" "$BACKUP_DIR/service-state")
  case "$mail_enabled" in enabled) systemctl enable "$mail_service" ;; *) systemctl disable "$mail_service" >/dev/null 2>&1 || true ;; esac
  case "$mail_active" in active) systemctl start "$mail_service" ;; *) systemctl stop "$mail_service" >/dev/null 2>&1 || true ;; esac
}
restore_service opendkim
restore_service postfix
echo "status=rolled_back generated_material_archived=$BACKUP_DIR/retired dns_changes=operator_managed packages=preserved_inert"
