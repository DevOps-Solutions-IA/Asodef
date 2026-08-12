# Master Phase 1D execution ledger

Date: 2026-08-09

## Baseline

- Branch: `main`
- Local HEAD: `93951e2a676437393f6e2f1978f5ee80168080e4`
- Upstream HEAD: `93951e2a676437393f6e2f1978f5ee80168080e4`
- Pre-existing work: intentional, uncommitted Phase 1A/1C changes in `.env.example`,
  `apps/api/package.json`, `apps/api/src/app.module.ts`, API environment validation,
  `pnpm-lock.yaml`, `apps/api/src/modules/master/`, and `docs/integrations/`.
- No pre-existing staged files were found.
- Shared agent-memory environment variables were not configured for this session.

## Ownership

| Workstream | Owned paths | Remote mutation authority |
| --- | --- | --- |
| Orchestrator | this ledger, integration conflict resolution, final gates | only reviewed, bounded operations |
| Agent A — Windows tunnel | `ops/master-tunnel/windows/`, `docs/integrations/firebird-tunnel-windows.md` | none; operator procedures only |
| Agent B — VPS/network | `ops/master-tunnel/vps/`, `docs/integrations/firebird-vps-network.md` | read-only audit only |
| Agent C — standalone gate | `apps/api/src/modules/master/tools/`, gate service and its tests | none |
| Agent D — failure testing | new Master failure/health test files assigned after Agent C stabilizes | none |
| Agent E — integration/read semantics | query/read repository and final integration docs assigned after A–D stabilize | only the three approved real gates |

No two workstreams may edit the same file concurrently. Agents do not commit,
push, deploy, change Firebird, or touch the protected WhatsApp Manager stack.

## Dependency graph

1. A, B and C inspect/implement independently.
2. D consumes C's stable gate contract and extends failure/observability coverage.
3. E consumes the stable infrastructure/backend evidence and resolves only read
   operations whose schema and business semantics are proven.
4. The orchestrator reviews every change and runs local, real-gate, exposure,
   recovery, Git and secret gates.

## Stop conditions

Execution stops rather than guessing if a privileged Windows operation, missing
secret, Firebird mutation, SYSDBA access, public listener, protected-stack
change, or ambiguous business rule is required.

## Reproducibility gate

Repository artifacts are required for the Windows lifecycle, VPS listener and
network verification, standalone backend gate, topology/runbook, rollback and
production checklist. Secrets and private keys remain external and are named
only by variable or secret-store key. A privileged step may be documented as
`REQUIRES_OPERATOR_APPROVAL`; it must never be represented as completed.

## Exposure evidence qualification

Historical outbound probes from the execution environment returned immediate
SYN-ACK for the expected ports and unrelated control ports, so they remain
non-authoritative evidence. Final privileged production inspection verified
the socket table, UFW, iptables, nftables, contextual `sshd` policy and Docker
publication. The resulting host security gate is `PASS`: `3051` is not
listening publicly, `33051` listens only on `172.25.51.1`, and explicit DROP
rules protect both ports on `eth0`.

## Orchestrator verification evidence

- Initial read-only VPS inspection recorded the historical pre-migration path
  `172.23.0.4 -> 172.23.0.1:33051`, no local `3051` listener, API-only loopback
  publication and Docker-private PostgreSQL/Redis.
- The production Compose file plus the repository network override passed
  `docker compose config --quiet` on the VPS using the existing protected env
  file; no rendered configuration or secret value was printed.
- All VPS shell artifacts passed `sh -n`; change scripts remained in dry-run.
- All six Windows PowerShell scripts passed parser validation in a disposable,
  network-disabled PowerShell container.
- The dedicated `asodef_master_tunnel` network is active with bridge
  `asodef-master0`, listener `172.25.51.1:33051` and API `172.25.51.2/29`.
- The exact UFW policy, privileged nftables inspection and effective restricted
  `sshd` policy passed `verify-host-security.sh` with `status=ok`.
- The public API alone was recreated, remained healthy and retained its stable
  Master address; the protected WhatsApp Manager stack was not touched.
- The Windows R3 watchdog runs manually under `asodef3`. Recovery injection
  terminated only its managed child `ssh.exe`; state transitioned through
  reconnecting to running, the PID changed, a single SSH child remained, and
  both VPS listener and API TCP connectivity recovered.
- Persistent Windows `AtLogOn` registration remains
  `OPERATOR_GATE_PENDING`; the current user does not have the legitimate
  administrative permission required, and no UAC bypass was attempted.

## Final executable gates

- Master bounded-context tests: 17 suites / 78 tests — pass.
- Full API tests: 109 suites / 885 tests — pass.
- Web tests: 451 — pass.
- Shared UI tests: 46 — pass.
- Payments tests: 5 — pass.
- Lint, strict TypeScript and production build — pass.
- Canonical `pnpm ci:verify` — pass: 34 migrations, three stable seed runs,
  compiled runtime and Chromium E2E 40/40.
- Previously verified real Firebird proof remains accepted baseline evidence:
  `ASODEF_READONLY`, health `1`, contract count `8687`. It was not rerun from
  this workspace because no authorized Master runtime secret is present.
- Gate 10 (host exposure controls): `PASS`; private listener, explicit public
  denies, nftables/UFW/sshd policy and absence of Docker publication verified.
- Gate 11 (API recreation on the target network): `PASS`; API healthy at
  `172.25.51.2`, API-to-listener connectivity restored and protected stack
  unchanged.
- Gate 12 (Windows recovery injection): `PASS` for the manual R3 watchdog.
- Windows persistence (`AtLogOn`): `OPERATOR_GATE_PENDING`, requiring a
  legitimate administrator.

## Production release boundary

The connectivity substrate is active, but the Master Adapter source remains
local and is not deployed. Production API remains
`asodef-public-platform-api:2eda5e0`; production web remains
`asodef-public-platform-web:93951e2`. No Master release, push, payment change,
Bold enablement or Firebird write occurred during Phase 1D reconciliation.

The source tree is operationally reproducible: every non-secret runtime,
verification, recovery and rollback action is represented in repository
artifacts. The only remaining dependency is the explicitly documented
`AtLogOn` administrator action; there are no undocumented manual steps.
