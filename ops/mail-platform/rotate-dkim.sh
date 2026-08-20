#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -eq 2 ] || die usage_rotate_config_new_selector
load_config "$1"
NEW_SELECTOR=$2
printf '%s' "$NEW_SELECTOR" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' || die invalid_new_selector
[ "$NEW_SELECTOR" != "$MAIL_DKIM_SELECTOR" ] || die selector_must_change
require_root
require_secure_config "$1"
require_approval

KEY_DIR="/etc/opendkim/keys/$MAIL_DOMAIN"
[ ! -e "$KEY_DIR/$NEW_SELECTOR.private" ] || die selector_already_exists
opendkim-genkey -b 2048 -D "$KEY_DIR" -d "$MAIL_DOMAIN" -s "$NEW_SELECTOR"
chown opendkim:opendkim "$KEY_DIR/$NEW_SELECTOR.private" "$KEY_DIR/$NEW_SELECTOR.txt"
chmod 0600 "$KEY_DIR/$NEW_SELECTOR.private"
chmod 0644 "$KEY_DIR/$NEW_SELECTOR.txt"
echo "status=dns_publication_required public_record_file=$KEY_DIR/$NEW_SELECTOR.txt"
echo 'Do not switch signing until the new TXT record verifies from multiple resolvers.'
