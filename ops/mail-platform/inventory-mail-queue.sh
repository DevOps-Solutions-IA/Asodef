#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

[ "$#" -eq 1 ] || die usage_queue_inventory_config
load_config "$1"
require_root
require_secure_config "$1"
require_command postqueue

mail_queue_count=$(postqueue -j | awk 'NF { count++ } END { print count + 0 }')
if [ "$mail_queue_count" -ne 0 ]; then
  printf 'status=blocked queue_messages=%s action=operator_quarantine_review_required dispatch=prohibited\n' "$mail_queue_count" >&2
  exit 1
fi

echo 'status=ok queue_messages=0 dispatch=none'
