#!/usr/bin/env sh
set -eu

die() {
  printf 'status=error code=%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing_command_$1"
}

require_root() {
  [ "$(id -u)" -eq 0 ] || die requires_root
}

require_approval() {
  [ "${MAIL_OPERATOR_APPROVAL:-NO}" = "YES" ] || die operator_approval_required
}

require_secure_root_file() {
  [ -f "$1" ] && [ ! -L "$1" ] || die "unsafe_file_$2"
  [ "$(stat -c %u "$1")" -eq 0 ] || die "wrong_owner_$2"
  [ "$(stat -c %a "$1")" = 600 ] || die "wrong_mode_$2"
}

require_secure_config() {
  require_secure_root_file "$1" config
}

require_secure_password_file() {
  require_secure_root_file "$MAIL_SMTP_PASSWORD_FILE" smtp_password
  [ -s "$MAIL_SMTP_PASSWORD_FILE" ] || die password_file_empty
}

require_value() {
  eval "mail_value=\${$1:-}"
  [ -n "$mail_value" ] || die "missing_$1"
  case "$mail_value" in
    *[![:print:]]*|*' '*|*'\t'*) die "invalid_$1" ;;
  esac
}

validate_inputs() {
  for mail_name in MAIL_DOMAIN MAIL_HOSTNAME MAIL_PUBLIC_IPV4 MAIL_PUBLIC_INTERFACE \
    MAIL_NETWORK_NAME MAIL_BRIDGE_NAME MAIL_SUBNET MAIL_GATEWAY MAIL_API_ADDRESS MAIL_LISTEN_ADDRESS \
    MAIL_API_CONTAINER MAIL_DKIM_SELECTOR MAIL_TLS_CERT_FILE MAIL_TLS_KEY_FILE \
    MAIL_ACME_WEBROOT MAIL_ACME_EMAIL MAIL_SMTP_USER MAIL_SMTP_FROM MAIL_MESSAGE_SIZE_LIMIT MAIL_SMTP_PASSWORD_FILE \
    ; do
    require_value "$mail_name"
  done
  printf '%s' "$MAIL_DOMAIN" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$' || die invalid_MAIL_DOMAIN
  [ "$MAIL_HOSTNAME" = "smtp.$MAIL_DOMAIN" ] || die invalid_MAIL_HOSTNAME
  for mail_token in "$MAIL_PUBLIC_INTERFACE" "$MAIL_NETWORK_NAME" "$MAIL_BRIDGE_NAME" "$MAIL_API_CONTAINER" "$MAIL_SMTP_USER"; do
    printf '%s' "$mail_token" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.@-]{1,127}$' || die invalid_mail_identifier
  done
  printf '%s' "$MAIL_SUBNET" | grep -Eq '^[0-9.]+/[0-9]{1,2}$' || die invalid_MAIL_SUBNET
  for mail_address in "$MAIL_GATEWAY" "$MAIL_API_ADDRESS" "$MAIL_LISTEN_ADDRESS"; do
    printf '%s' "$mail_address" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || die invalid_mail_network_address
  done
  [ "$MAIL_LISTEN_ADDRESS" = "$MAIL_GATEWAY" ] || die listener_must_equal_gateway
  [ "$MAIL_DKIM_SELECTOR" = asodef2026 ] || die certified_dkim_selector_mismatch
  printf '%s' "$MAIL_DKIM_SELECTOR" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' || die invalid_MAIL_DKIM_SELECTOR
  printf '%s' "$MAIL_SMTP_FROM" | grep -Eq "^[^@[:space:]]+@$MAIL_DOMAIN$" || die invalid_MAIL_SMTP_FROM
  printf '%s' "$MAIL_ACME_EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$' || die invalid_MAIL_ACME_EMAIL
  printf '%s' "$MAIL_MESSAGE_SIZE_LIMIT" | grep -Eq '^[0-9]+$' || die invalid_MAIL_MESSAGE_SIZE_LIMIT
  [ "$MAIL_MESSAGE_SIZE_LIMIT" -ge 1048576 ] && [ "$MAIL_MESSAGE_SIZE_LIMIT" -le 52428800 ] || die invalid_MAIL_MESSAGE_SIZE_LIMIT
  case "$MAIL_TLS_CERT_FILE:$MAIL_TLS_KEY_FILE:$MAIL_ACME_WEBROOT:$MAIL_SMTP_PASSWORD_FILE" in /*:/*:/*:/*) : ;; *) die secret_and_tls_paths_must_be_absolute ;; esac
  [ "$MAIL_TLS_CERT_FILE" = /etc/postfix/tls/fullchain.pem ] || die certified_tls_certificate_path_mismatch
  [ "$MAIL_TLS_KEY_FILE" = /etc/postfix/tls/privkey.pem ] || die certified_tls_key_path_mismatch
  case "${MAIL_OPERATOR_APPROVAL:-NO}" in YES|NO) : ;; *) die invalid_MAIL_OPERATOR_APPROVAL ;; esac
  case "${MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS:-NO}" in YES|NO) : ;; *) die invalid_MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS ;; esac
  python3 "$SCRIPT_DIR/validate-network-contract.py" --subnet "$MAIL_SUBNET" --gateway "$MAIL_GATEWAY" --api "$MAIL_API_ADDRESS"
  python3 -c 'import ipaddress,sys; ipaddress.ip_address(sys.argv[1])' "$MAIL_PUBLIC_IPV4" 2>/dev/null || die invalid_MAIL_PUBLIC_IPV4
}

load_config() {
  [ "$#" -eq 1 ] || die config_path_required
  [ -f "$1" ] || die config_not_found
  require_command sha256sum
  mail_config_hash_before=$(sha256sum "$1" | awk '{print $1}')
  mail_config_seen='|'
  while IFS='=' read -r mail_config_name mail_config_value || [ -n "$mail_config_name" ]; do
    case "$mail_config_name" in
      ''|'#'*) continue ;;
      MAIL_DOMAIN|MAIL_HOSTNAME|MAIL_PUBLIC_IPV4|MAIL_PUBLIC_INTERFACE|MAIL_NETWORK_NAME|MAIL_BRIDGE_NAME|MAIL_SUBNET|MAIL_GATEWAY|MAIL_API_ADDRESS|MAIL_LISTEN_ADDRESS|MAIL_API_CONTAINER|MAIL_DKIM_SELECTOR|MAIL_TLS_CERT_FILE|MAIL_TLS_KEY_FILE|MAIL_ACME_WEBROOT|MAIL_ACME_EMAIL|MAIL_SMTP_USER|MAIL_SMTP_FROM|MAIL_MESSAGE_SIZE_LIMIT|MAIL_OPERATOR_APPROVAL|MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS|MAIL_SMTP_PASSWORD_FILE)
        case "$mail_config_seen" in *"|$mail_config_name|"*) die "duplicate_config_key_$mail_config_name" ;; esac
        mail_config_seen="$mail_config_seen$mail_config_name|"
        export "$mail_config_name=$mail_config_value"
        ;;
      *) die "unknown_config_key_$mail_config_name" ;;
    esac
  done < "$1"
  [ "$(sha256sum "$1" | awk '{print $1}')" = "$mail_config_hash_before" ] || die config_changed_during_load
  validate_inputs
}

escape_replacement() {
  printf '%s' "$1" | sed 's/[&|\\]/\\&/g'
}

render_template() {
  mail_source=$1
  mail_target=$2
  mail_tmp="${mail_target}.tmp.$$"
  sed \
    -e "s|@@MAIL_DOMAIN@@|$(escape_replacement "$MAIL_DOMAIN")|g" \
    -e "s|@@MAIL_HOSTNAME@@|$(escape_replacement "$MAIL_HOSTNAME")|g" \
    -e "s|@@MAIL_DKIM_SELECTOR@@|$(escape_replacement "$MAIL_DKIM_SELECTOR")|g" \
    -e "s|@@MAIL_TLS_CERT_FILE@@|$(escape_replacement "$MAIL_TLS_CERT_FILE")|g" \
    -e "s|@@MAIL_TLS_KEY_FILE@@|$(escape_replacement "$MAIL_TLS_KEY_FILE")|g" \
    -e "s|@@MAIL_MESSAGE_SIZE_LIMIT@@|$(escape_replacement "$MAIL_MESSAGE_SIZE_LIMIT")|g" \
    -e "s|@@MAIL_LISTEN_ADDRESS@@|$(escape_replacement "$MAIL_LISTEN_ADDRESS")|g" \
    -e "s|@@MAIL_API_ADDRESS@@|$(escape_replacement "$MAIL_API_ADDRESS")|g" \
    "$mail_source" > "$mail_tmp"
  grep -q '@@' "$mail_tmp" && die unresolved_template_variable
  chmod 0644 "$mail_tmp"
  mv "$mail_tmp" "$mail_target"
}
