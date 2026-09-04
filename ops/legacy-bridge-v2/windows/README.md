# ASODEF Legacy Bridge Runtime v2 — Windows

This runtime replaces the fragile profile-dependent R3 launcher without changing
the approved VPS or Firebird topology.

## Fixed transport contract

- Windows gateway: WIN-Q0DAPTGTQ4P
- outbound SSH only: 169.58.36.138:22
- SSH identity: asodef-tunnel
- reverse listener: 172.25.51.1:33051
- Firebird target: 10.125.16.253:3051
- no public 3051 or 33051

The runtime does not contain or use a Firebird password.

## Why v2 exists

R3 historically worked, including reverse-forward recovery, but its Windows
runtime depended on profile-expanded paths and stale state.json could outlive
the actual processes. The September inspection also found the launcher absent
from the active runtime.

V2 therefore:

1. uses absolute paths only;
2. stores runtime state under C:\ProgramData\ASODEF\legacy-bridge-v2;
3. treats state as advisory and verifies live watchdog and SSH processes;
4. uses an OS-level exclusive file handle for single-instance ownership;
5. checks the stop request while SSH is alive instead of blocking indefinitely;
6. keeps the previous fail-closed OpenSSH controls;
7. keeps persistence as a separate operator-controlled deployment gate.

## Installation and persistence boundary

Do not overwrite R3 in place. Deploy v2 to a new stable directory, create a
config from bridge.config.example.json, and validate all referenced files before
starting it.

Persistent startup is installed only by
`Register-AsodefLegacyBridgeV2StartupTask.ps1 -OperatorApproved`. The
production task name is `ASODEF-Legacy-Bridge-V2`. It runs as SYSTEM, starts
at boot, and also has an indefinite one-minute trigger with
`MultipleInstances=IgnoreNew`. The periodic trigger is the validated
self-healing mechanism on this Windows Server 2016 host; RestartOnFailure was
tested and was not reliable enough to use.

## Health semantics

The health script supports the persistent direct-SSH task and the manual
watchdog mode. For the production scheduled-task mode, a healthy result
requires the task to be running, exactly the managed direct `ssh.exe` process
to be alive, the generated `ssh_config` to remain pinned to the approved
transport contract, and Windows to reach `10.125.16.253:3051`.

A stopped or stale watchdog state is not considered healthy. The VPS/API
read-only gate remains authoritative for end-to-end listener and Firebird
reachability.

## Non-negotiable invariants

V2 must not:

- touch local Firebird 3050;
- modify AdaSys services, DSNs or executables;
- change Firebird schema, data or grants;
- use SYSDBA;
- disable host-key checking;
- enable SSH passwords, TTY, X11 or agent forwarding;
- publish 3051 or 33051;
- widen the VPS firewall;
- attach additional containers to asodef_master_tunnel;
- recreate or modify the protected WhatsApp Manager stack.


## Replacement VPS

Use `Set-AsodefLegacyBridgeV2VpsHost.ps1` to stage a replacement VPS. It
requires an independently approved ED25519 host fingerprint, verifies the
`ssh-keyscan` result against that fingerprint, updates the dedicated
`known_hosts`, and updates `sshHost`/`sshPort` without restarting the
production task. Re-register and start the task only after the replacement VPS
has been bootstrapped and its SSH public key restriction installed.

For a complete rebuild where the V2 private identity was also lost,
`Provision-AsodefLegacyBridgeV2Identity.ps1` accepts
`-ExpectedHostFingerprint` so a new identity can be generated against a new
trusted VPS without relying on the original VPS fingerprint.
