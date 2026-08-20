#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for script in "$script_dir"/*.sh; do
  [[ "$script" == "$script_dir/test-artifacts.sh" ]] || bash -n "$script"
done

runtime_dir=$(mktemp -d)
trap 'rm -rf "$runtime_dir"' EXIT
synthetic_key=$(openssl rand -hex 32)
synthetic_password=$(openssl rand -hex 24)
cat > "$runtime_dir/valid.env" <<EOF
ADMIN_ACCOUNT_EMAIL=admin@asodef.com.co
ADMIN_RECOVERY_EMAIL=asodefsas@gmail.com
ADMIN_MFA_REQUIRED=false
ADMIN_MFA_CHALLENGE_TTL_SECONDS=300
ADMIN_MFA_ENROLLMENT_TTL_SECONDS=900
ADMIN_STEP_UP_TTL_SECONDS=300
ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS=5
ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS=300
ENCRYPTION_KEY=$synthetic_key
SMTP_HOST=smtp.invalid
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=synthetic-user
SMTP_PASSWORD=$synthetic_password
SMTP_FROM=no-reply@example.invalid
EOF
unset synthetic_key synthetic_password

"$script_dir/verify-runtime-env.sh" --env-file "$runtime_dir/valid.env" --expected-mfa false >/dev/null
sed 's/^ADMIN_ACCOUNT_EMAIL=.*/ADMIN_ACCOUNT_EMAIL=asodefsas@gmail.com/' \
  "$runtime_dir/valid.env" > "$runtime_dir/invalid.env"
if "$script_dir/verify-runtime-env.sh" --env-file "$runtime_dir/invalid.env" --expected-mfa false >/dev/null 2>&1; then
  echo 'status=error code=ENV_VALIDATOR_ACCEPTED_RECOVERY_LOGIN' >&2
  exit 1
fi

if grep -RIEq --include='*.yml' --include='*.sh' \
  '(BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY|postgres(ql)?://[^$[:space:]]+:[^$[:space:]@]+@|SMTP_PASSWORD:[[:space:]]+[^$])' \
  "$script_dir"; then
  echo 'status=error code=STATIC_SECRET_PATTERN_FOUND' >&2
  exit 1
fi

echo 'status=ok syntax=PASS envValidation=PASS negativeIdentity=PASS staticSecretScan=PASS'
