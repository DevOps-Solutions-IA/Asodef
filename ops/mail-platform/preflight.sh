#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

load_config "${1:-}"
require_root
require_secure_config "$1"
require_secure_password_file

for mail_command in openssl ss grep awk; do require_command "$mail_command"; done
"$SCRIPT_DIR/verify-dns.sh" "$1"

printf 'check=tls_files '
[ -r "$MAIL_TLS_CERT_FILE" ] && [ -r "$MAIL_TLS_KEY_FILE" ] || die tls_files_unreadable
openssl x509 -in "$MAIL_TLS_CERT_FILE" -noout -checkend 604800 >/dev/null || die tls_certificate_expiring
openssl x509 -in "$MAIL_TLS_CERT_FILE" -noout -checkhost "$MAIL_HOSTNAME" >/dev/null || die tls_hostname_mismatch
echo PASS

printf 'check=password_file '
require_secure_password_file
echo PASS

printf 'check=port_conflicts '
if ss -lnt | awk '{print $4}' | grep -Eq '(^|:)(25|587)$'; then die mail_port_conflict; fi
echo PASS

echo 'status=ok mode=read-only-preflight'
