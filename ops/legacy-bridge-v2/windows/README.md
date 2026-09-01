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

## Installation boundary

Do not overwrite R3 in place. Deploy v2 to a new stable directory, create a
config from bridge.config.example.json, and validate all referenced files before
starting it.

Persistent startup registration is deliberately not performed by these runtime
scripts. It remains a separate Windows operator action after manual runtime and
end-to-end validation pass.

## Health semantics

A healthy result requires all of:

- state says running;
- recorded watchdog PID is a live PowerShell process running
  Start-AsodefLegacyBridgeV2.ps1;
- recorded SSH PID is a live process from the configured ssh.exe;
- its command line contains the exact approved reverse-forward and SSH identity;
- Windows can reach 10.125.16.253:3051.

The VPS/API probe remains authoritative for end-to-end listener reachability.

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
