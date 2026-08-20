#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --env-file PATH --expected-mfa true|false" >&2
  exit 64
}

env_file=""
expected_mfa=""
while (($#)); do
  case "$1" in
    --env-file) [[ $# -ge 2 ]] || usage; env_file=$2; shift 2 ;;
    --expected-mfa) [[ $# -ge 2 ]] || usage; expected_mfa=$2; shift 2 ;;
    *) usage ;;
  esac
done

[[ -f "$env_file" ]] || { echo 'status=error code=ENV_FILE_UNAVAILABLE' >&2; exit 1; }
[[ "$expected_mfa" == "true" || "$expected_mfa" == "false" ]] || usage

read_value() {
  local key=$1 line value
  line=$(awk -v wanted="$key" '
    /^[[:space:]]*#/ { next }
    {
      candidate=$0
      sub(/^[[:space:]]*/, "", candidate)
      if (index(candidate, wanted "=") == 1) found=substr(candidate, length(wanted) + 2)
    }
    END { if (found != "") print found; else if (index(candidate, wanted "=") == 1) print "" }
  ' "$env_file")
  value=${line%$'\r'}
  if [[ ${#value} -ge 2 && (( ${value:0:1} == '"' && ${value: -1} == '"' ) || ( ${value:0:1} == "'" && ${value: -1} == "'" )) ]]; then
    value=${value:1:${#value}-2}
  fi
  printf '%s' "$value"
}

has_key() {
  awk -v wanted="$1" '
    /^[[:space:]]*#/ { next }
    { candidate=$0; sub(/^[[:space:]]*/, "", candidate); if (index(candidate, wanted "=") == 1) found=1 }
    END { exit(found ? 0 : 1) }
  ' "$env_file"
}

required=(
  ADMIN_ACCOUNT_EMAIL ADMIN_RECOVERY_EMAIL ADMIN_MFA_REQUIRED
  ADMIN_MFA_CHALLENGE_TTL_SECONDS ADMIN_MFA_ENROLLMENT_TTL_SECONDS
  ADMIN_STEP_UP_TTL_SECONDS ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS
  ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS ENCRYPTION_KEY SMTP_HOST SMTP_PORT
  SMTP_SECURE SMTP_USER SMTP_PASSWORD SMTP_FROM
)

for key in "${required[@]}"; do
  has_key "$key" || { echo "status=error code=MISSING_RUNTIME_KEY key=$key" >&2; exit 1; }
  [[ -n "$(read_value "$key")" ]] || { echo "status=error code=EMPTY_RUNTIME_KEY key=$key" >&2; exit 1; }
done

[[ "$(read_value ADMIN_ACCOUNT_EMAIL)" == "admin@asodef.com.co" ]] || { echo 'status=error code=ADMIN_ACCOUNT_MISMATCH' >&2; exit 1; }
[[ "$(read_value ADMIN_RECOVERY_EMAIL)" == "asodefsas@gmail.com" ]] || { echo 'status=error code=ADMIN_RECOVERY_MISMATCH' >&2; exit 1; }
[[ "$(read_value ADMIN_MFA_REQUIRED)" == "$expected_mfa" ]] || { echo 'status=error code=MFA_ROLLOUT_STATE_MISMATCH' >&2; exit 1; }
[[ "$(read_value SMTP_SECURE)" =~ ^(true|false)$ ]] || { echo 'status=error code=SMTP_SECURE_INVALID' >&2; exit 1; }

port=$(read_value SMTP_PORT)
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || { echo 'status=error code=SMTP_PORT_INVALID' >&2; exit 1; }
[[ "$(read_value SMTP_FROM)" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo 'status=error code=SMTP_FROM_INVALID' >&2; exit 1; }
encryption_key=$(read_value ENCRYPTION_KEY)
(( ${#encryption_key} >= 32 )) || { echo 'status=error code=ENCRYPTION_KEY_INVALID' >&2; exit 1; }
unset encryption_key

bounded_integer() {
  local key=$1 minimum=$2 maximum=$3 value
  value=$(read_value "$key")
  [[ "$value" =~ ^[0-9]+$ ]] && ((value >= minimum && value <= maximum)) || {
    echo "status=error code=RUNTIME_INTEGER_INVALID key=$key" >&2
    exit 1
  }
}

bounded_integer ADMIN_MFA_CHALLENGE_TTL_SECONDS 60 600
bounded_integer ADMIN_MFA_ENROLLMENT_TTL_SECONDS 300 3600
bounded_integer ADMIN_STEP_UP_TTL_SECONDS 60 1800
bounded_integer ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS 3 10
bounded_integer ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS 60 3600

echo "status=ok keys=${#required[@]} adminIdentity=valid mfaRequired=$expected_mfa smtp=CONFIGURED secrets=REDACTED"
