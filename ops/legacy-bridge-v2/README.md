# ASODEF Legacy Bridge V2 — disaster recovery and VPS rebuild

This directory is the reproducible recovery source for the private ASODEF
Firebird bridge. The goal is to rebuild the VPS-side transport on a clean VPS
without restoring an old VPS image and without storing private keys or Firebird
credentials in Git.

## Recovery contract

The canonical private topology is:

```text
ASODEF API 172.25.51.2
  -> internal Docker network asodef_master_tunnel
  -> bridge asodef-master0
  -> 172.25.51.1:33051
  -> restricted reverse SSH from Windows
  -> WIN-Q0DAPTGTQ4P
  -> 10.125.16.253:3051 / BDAdaSysSO
```

The SSH account is `asodef-tunnel`. It is public-key-only, has a nologin
shell, can create only remote forwarding, and is restricted to
`172.25.51.1:33051`. Ports 3051 and 33051 must never be published on the
Internet.

## What Git can reproduce

Git contains the network contract, VPS bootstrap/verification scripts, Windows
runtime, scheduled-task registration, and health checks. It intentionally does
not contain private SSH keys, Firebird passwords, production environment files,
or a trusted VPS host fingerprint.

Those values are either regenerated or supplied through the approved secret
store/out-of-band trust process. This is a security property, not a missing
backup.

## Supported recovery cases

### VPS lost, Windows gateway preserved

1. Provision a supported Linux VPS with Docker, OpenSSH server, UFW and sudo.
2. Clone this repository at the approved release/commit.
3. Copy the existing V2 public key (`.pub`, never the private key) to a
   temporary file on the VPS.
4. Run `vps/bootstrap-vps.sh --public-key-file <file>` first in dry-run.
5. After operator approval, run the same command with `--apply`.
6. Deploy the ASODEF API using the existing
   `ops/master-tunnel/vps/docker-compose.master-tunnel.yml` override so only
   the API joins `asodef_master_tunnel` at `172.25.51.2`.
7. Obtain the new VPS ED25519 host fingerprint through a trusted out-of-band
   source. Update/pin Windows `known_hosts` and `sshHost`; never accept a
   changed key blindly.
8. Re-register `ASODEF-Legacy-Bridge-V2` and start it.
9. Run `vps/verify-vps.sh --e2e`.

### VPS and bridge SSH identity both lost

Generate a new ED25519 bridge identity on Windows with
`Provision-AsodefLegacyBridgeV2Identity.ps1`. Install only its public key on
the new VPS with the bootstrap script. Do not try to recover a lost private key
from Git. The old public key can be removed only after the new E2E path passes.

## Rebuild acceptance gates

Recovery is complete only when all of these pass:

- Docker network is internal, `172.25.51.0/29`, gateway
  `172.25.51.1`, bridge `asodef-master0`.
- Only the production API is attached and has `172.25.51.2`.
- SSH effective policy is public-key-only and remote-forward-only.
- The authorized key contains the exact `permitlisten` restriction.
- Listener exists only on `172.25.51.1:33051`, never wildcard.
- Docker publishes neither 3051 nor 33051.
- API can reach the private listener.
- `pnpm --silent master:verify-readonly` returns
  `status=ok`, `currentUser=ASODEF_READONLY`, and `healthValue=1`.

The contract count is deliberately not pinned because production data changes.

## Current Windows resilience model

The production task is `ASODEF-Legacy-Bridge-V2`, runs as SYSTEM, starts at
boot, and has an indefinite one-minute recovery trigger with
`MultipleInstances=IgnoreNew`. This host has been validated to recover from a
forced `ssh.exe` termination without a Windows reboot. A physical reboot test
is intentionally not required while unrelated production services are running.

## Safety boundaries

The recovery procedure never changes Firebird schema/data/grants, never uses
SYSDBA, never disables host-key checking, never makes 3051/33051 public, and
never modifies the protected WhatsApp Manager stack.
