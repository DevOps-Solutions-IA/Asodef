# ASODEF Master Firebird tunnel — Windows runtime

These artifacts maintain the outbound, read-only connectivity path from the
Windows gateway to the private listener on the ASODEF VPS. They never contain
or handle a Firebird password.

Operational instructions are in
[`docs/integrations/firebird-tunnel-windows.md`](../../../docs/integrations/firebird-tunnel-windows.md).

The safe default lifecycle is a limited, current-user Task Scheduler task at
logon. A watchdog keeps one SSH process alive and reconnects with a bounded
backoff. Enabling execution before interactive logon requires a privileged
Windows task change and is explicitly outside the automatic installation
script.

Files:

- `Start-AsodefFirebirdTunnel.ps1`: single-instance watchdog;
- `Test-AsodefFirebirdTunnel.ps1`: JSON health result;
- `Stop-AsodefFirebirdTunnel.ps1`: graceful stop request;
- `Restart-AsodefFirebirdTunnel.ps1`: bounded task restart;
- `Register-AsodefFirebirdTunnelTask.ps1`: operator-approved logon task;
- `AsodefFirebirdTunnel.Common.ps1`: validation, health and sanitized logging;
- `tunnel.config.example.json`: non-secret, fail-closed configuration example.

The watchdog uses OpenSSH's native `-E` file logging for transient SSH
diagnostics. It never attaches a PowerShell `ErrorDataReceived` callback, which
keeps the runtime compatible with Windows PowerShell 5.1 on Windows Server
2016. The file is bounded to the current attempt, cleared after classification,
and only the sanitized failure category is copied to the operational JSON log.
