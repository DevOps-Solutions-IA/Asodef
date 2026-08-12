# Firebird private-path hardening — VPS assessment

Date: 2026-08-09

## Verified production state

- The VPS is `vmi3448457`, Ubuntu, administered as `asodefadmin`.
- The dedicated internal Docker network is `asodef_master_tunnel`, with subnet
  `172.25.51.0/29` and stable Linux bridge `asodef-master0`.
- The reverse listener is bound only to `172.25.51.1:33051`; it is not bound to
  `0.0.0.0` or `::`.
- The production API is the only member of that network and has the stable
  address `172.25.51.2/29` declared by the Compose override.
- API-to-listener connectivity passes after a controlled API recreation.
- UFW allows only `172.25.51.2 -> 172.25.51.1:33051` on `asodef-master0` and
  explicitly denies inbound `eth0` traffic to ports `3051` and `33051`.
- Privileged inspection of UFW, iptables, nftables, sockets, contextual `sshd`
  policy and Docker publication completed with `verify-host-security.sh`
  returning `status=ok`.
- The `asodef-tunnel` account uses `/usr/sbin/nologin`; its effective policy is
  public-key-only, remote-forward-only, without password, PTY, agent, X11 or
  arbitrary listen endpoints.
- The API publishes only `127.0.0.1:3200`; PostgreSQL, Redis, Firebird `3051`
  and tunnel port `33051` have no public Docker publication.
- The protected `asodef-whatsapp-manager-production` stack was not recreated,
  reconfigured or attached to the Master network.

## Historical finding and selected correction

Before migration, the listener was `172.23.0.1:33051` and the API reached it
from the instance-specific address `172.23.0.4`. That historical state made
the UFW allowance dependent on a transient container address. A broad
allowance for `172.23.0.0/16` was rejected because it would also authorize web,
edge and ACME containers.

The implemented correction is the dedicated internal Docker bridge:

```text
API 172.25.51.2
  -> asodef-master0
  -> 172.25.51.1:33051
  -> restricted SSH reverse forward
  -> Firebird private endpoint
```

The network has explicit IPAM, a stable Linux bridge name, is external to the
Compose project lifecycle and attaches only to API. UFW permits the single
source/destination/port tuple. The existing egress and data networks remain
unchanged.

This design survives API recreation without widening access to a whole subnet
or depending on a Docker-generated bridge identifier.

## Completed operator actions

The bounded operator activation completed:

1. installed and syntax-validated the reviewed `sshd` Match policy;
2. confirmed the effective policy with `sshd -T -C ...`;
3. installed the exact private UFW allow and public-interface deny rules;
4. inspected the effective UFW, iptables and nftables state;
5. created the dedicated network and attached only the public ASODEF API;
6. recreated only `asodef-public-platform-production-api-1` and confirmed
   health, stable `172.25.51.2` addressing and API-to-tunnel connectivity;
7. removed the dependency on the historical `172.23.0.4` rule;
8. ran `verify-host-security.sh` successfully without touching the protected
   WhatsApp Manager stack.

## Exposure evidence

The production host security gate is `PASS`: no wildcard listener exists,
`eth0:3051` and `eth0:33051` have explicit DROP rules, nftables reflects the
managed policy, and Docker publishes neither port. Earlier probes from the
local execution environment returned SYN-ACK for arbitrary control ports and
remain historical non-authoritative evidence; they are not used to override
the verified host-side result.

## Remaining operator gate and rollback

VPS/network activation has no pending action. The only known operational gate
is Windows `AtLogOn` task registration, which requires a legitimate
administrator and is tracked as `OPERATOR_GATE_PENDING` in the Windows
runbook. The manual R3 watchdog and recovery path are already validated.

`172.23.0.1:33051` and `172.23.0.4` are rollback-only references. They may be
restored only as a coordinated rollback with the previous `sshd` and exact UFW
policy; they are not an alternate active path. The executable rollback remains
in `ops/master-tunnel/vps/README.md`.
