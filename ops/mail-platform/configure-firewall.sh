#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || die usage_firewall_config_apply
load_config "$1"
MODE=${2:---dry-run}

submission_comment='ASODEF API SMTP submission exact source'
smtp_comment='ASODEF inbound SMTP direct delivery'
smtps_comment='DENY legacy implicit SMTPS'
public_submission_comment='DENY public ASODEF SMTP submission'

print_rules() {
  echo "ufw allow in on $MAIL_BRIDGE_NAME from $MAIL_API_ADDRESS to $MAIL_GATEWAY port 587 proto tcp comment '$submission_comment'"
  echo "ufw deny in on $MAIL_PUBLIC_INTERFACE to $MAIL_PUBLIC_IPV4 port 25 proto tcp comment '$smtp_comment'"
  echo "ufw deny in on $MAIL_PUBLIC_INTERFACE to $MAIL_PUBLIC_IPV4 port 465 proto tcp comment '$smtps_comment'"
  echo "ufw deny in on $MAIL_PUBLIC_INTERFACE to $MAIL_PUBLIC_IPV4 port 587 proto tcp comment '$public_submission_comment'"
}

if [ "$MODE" = "--dry-run" ]; then
  echo 'REQUIRES_OPERATOR_APPROVAL'
  print_rules
  exit 0
fi
[ "$MODE" = "--apply" ] || die invalid_mode
require_root
require_secure_config "$1"
require_approval
require_command flock
require_command sha256sum

STATE_FILE=/var/lib/asodef-mail-platform-ufw-state
LOCK_FILE=/run/lock/asodef-mail-platform-ufw.lock
exec 9>"$LOCK_FILE"
flock -x 9
mail_contract=$(printf '%s\n' "$MAIL_BRIDGE_NAME" "$MAIL_API_ADDRESS" "$MAIL_GATEWAY" "$MAIL_PUBLIC_INTERFACE" "$MAIL_PUBLIC_IPV4" | sha256sum | awk '{print $1}')

has_comment() {
  ufw status numbered | grep -F "$1" >/dev/null
}

if [ -e "$STATE_FILE" ]; then
  require_secure_root_file "$STATE_FILE" ufw_state
  [ "$(sed -n 's/^contract=//p' "$STATE_FILE")" = "$mail_contract" ] || die ufw_state_contract_mismatch
  for mail_comment in "$submission_comment" "$smtp_comment" "$smtps_comment" "$public_submission_comment"; do
    has_comment "$mail_comment" || die managed_ufw_rule_missing
  done
  echo 'status=ok firewall=already_managed'
  exit 0
fi

for mail_comment in "$submission_comment" "$smtp_comment" "$smtps_comment" "$public_submission_comment"; do
  if has_comment "$mail_comment"; then die orphaned_managed_ufw_rule; fi
done

created_submission=NO
created_smtp=NO
created_smtps=NO
created_public_submission=NO
delete_owned_comment() {
  mail_number=$(ufw status numbered | awk -v needle="$1" 'index($0, needle) { line=$0; sub(/^[[:space:]]*\[[[:space:]]*/, "", line); sub(/\].*$/, "", line); gsub(/[[:space:]]/, "", line); print line; exit }')
  [ -z "$mail_number" ] || ufw --force delete "$mail_number" >/dev/null
}
cleanup_partial() {
  [ "$created_public_submission" = NO ] || delete_owned_comment "$public_submission_comment"
  [ "$created_smtps" = NO ] || delete_owned_comment "$smtps_comment"
  [ "$created_smtp" = NO ] || delete_owned_comment "$smtp_comment"
  [ "$created_submission" = NO ] || delete_owned_comment "$submission_comment"
}
trap cleanup_partial EXIT HUP INT TERM

ufw allow in on "$MAIL_BRIDGE_NAME" from "$MAIL_API_ADDRESS" to "$MAIL_GATEWAY" port 587 proto tcp comment "$submission_comment"
created_submission=YES
ufw deny in on "$MAIL_PUBLIC_INTERFACE" to "$MAIL_PUBLIC_IPV4" port 25 proto tcp comment "$smtp_comment"
created_smtp=YES
ufw deny in on "$MAIL_PUBLIC_INTERFACE" to "$MAIL_PUBLIC_IPV4" port 465 proto tcp comment "$smtps_comment"
created_smtps=YES
ufw deny in on "$MAIL_PUBLIC_INTERFACE" to "$MAIL_PUBLIC_IPV4" port 587 proto tcp comment "$public_submission_comment"
created_public_submission=YES
for mail_comment in "$submission_comment" "$smtp_comment" "$smtps_comment" "$public_submission_comment"; do
  has_comment "$mail_comment" || die ufw_rule_apply_verification_failed
done
mail_state_tmp="$STATE_FILE.tmp.$$"
printf 'contract=%s\n' "$mail_contract" > "$mail_state_tmp"
chmod 0600 "$mail_state_tmp"
mv "$mail_state_tmp" "$STATE_FILE"
trap - EXIT HUP INT TERM
ufw status numbered
echo 'status=ok firewall=managed ownership=recorded'
