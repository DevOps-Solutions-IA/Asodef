#!/usr/bin/env sh
set -eu

[ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/smtp.asodef.com.co" ] || exit 0
openssl x509 -in "$RENEWED_LINEAGE/fullchain.pem" -noout -checkend 604800 >/dev/null
openssl x509 -in "$RENEWED_LINEAGE/fullchain.pem" -noout -checkhost smtp.asodef.com.co >/dev/null
postfix check
if [ "$(systemctl is-active postfix 2>/dev/null || true)" = active ]; then
  systemctl reload postfix
  echo 'status=ok component=postfix certificate=reloaded'
else
  echo 'status=ok component=postfix certificate=verified service=inactive'
fi
