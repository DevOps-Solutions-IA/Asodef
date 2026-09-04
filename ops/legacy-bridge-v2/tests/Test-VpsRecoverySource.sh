#!/usr/bin/env sh
set -eu

ROOT="${1:-$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)}"
BOOTSTRAP="$ROOT/vps/bootstrap-vps.sh"
VERIFY="$ROOT/vps/verify-vps.sh"
README="$ROOT/README.md"

for file in "$BOOTSTRAP" "$VERIFY" "$README"; do
  [ -f "$file" ] || { echo "missing recovery artifact: $file" >&2; exit 1; }
done

sh -n "$BOOTSTRAP"
sh -n "$VERIFY"

required_bootstrap='asodef-tunnel asodef_master_tunnel asodef-master0 172.25.51.0/29 172.25.51.1 172.25.51.2 33051 3051 restrict,port-forwarding permitlisten AllowTcpForwarding GatewayPorts PasswordAuthentication KbdInteractiveAuthentication PermitTTY X11Forwarding AllowAgentForwarding PermitTunnel'
for token in $required_bootstrap; do
  grep -Fq "$token" "$BOOTSTRAP" || { echo "bootstrap contract missing: $token" >&2; exit 1; }
done

required_verify='wildcard_listener public_firebird_listener network_member_count api_to_tunnel master:verify-readonly ASODEF_READONLY'
for token in $required_verify; do
  grep -Fq "$token" "$VERIFY" || { echo "verify gate missing: $token" >&2; exit 1; }
done

for forbidden in 'StrictHostKeyChecking no' '0.0.0.0:33051' 'SYSDBA' 'REVOKE ' 'GRANT '; do
  if grep -Fq "$forbidden" "$BOOTSTRAP" "$VERIFY"; then
    echo "forbidden recovery pattern: $forbidden" >&2
    exit 1
  fi
done

printf '{"status":"ok","recoveryArtifacts":3,"vpsBootstrapPinned":true,"e2eGatePinned":true}\n'
