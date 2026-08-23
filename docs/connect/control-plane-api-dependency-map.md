# ASODEF Connect — Control Plane API dependency map

Evidence date: 2026-08-22. Consumer branch: `codex/connect-control-plane`, resynchronized on `origin/main` `0c3ed988c2c1c873363e41ae4c4855e373ed8c7a`.

The Control Plane is a consumer only. This document records canonical contracts, UI adapters and missing runtimes; it does not implement, mock or claim an API. `BACKEND_RUNTIME_MISSING` means a contract is in `main` but no stable administrative or execution runtime was verified. `BLOCKED_BY_PLANS` means the approved Plans decisions and canonical application service remain prerequisites.

## Integrated canonical evidence

| Capability                                              | Integrated source | Main evidence                                                                       | Status    |
| ------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- | --------- |
| Business Core                                           | PR #10            | merge `95b1c2a`                                                                     | `IN_MAIN` |
| AI Gateway, Tool Gateway and Knowledge contracts        | PR #20            | merge `6cd482f`; `packages/connect-contracts` and `apps/api/src/modules/ai-gateway` | `IN_MAIN` |
| Koral Conversation Core and canonical gateway adapters  | PR #19            | merge `e8979e8`; `apps/api/src/modules/koral-conversations`                         | `IN_MAIN` |
| Domain Events, Automation, Communications and Templates | PR #21            | merge `0c3ed98`; `packages/connect-contracts`                                       | `IN_MAIN` |

There is one canonical `@asodef/connect-contracts` package in `main`. Koral consumes the AI, Tool and Knowledge gateways through Koral-named adapters; it does not own parallel gateway contracts. The former temporary Knowledge resolver is no longer present.

## Contract reconciliation

| UI capability                                                  | Canonical source in `main`                                                               | Classification            | Consumer decision                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation list/detail, channels and handoff status          | `KoralConversationsController`, `ConversationSummaryResponse`, Prisma conversation enums | `ADAPTER_REQUIRED`        | Bind the web client to the declared API response. Dates require transport serialization; do not expose a Prisma shape directly in the UI. |
| Assignment/takeover, return to Koral, internal note            | Koral conversation commands                                                              | `MATCHES_CANONICAL`       | Preserve canonical RBAC, step-up, version compare-and-swap, idempotency and sanitized audit semantics.                                    |
| Queue filtering, release, priority-only change, resolve, close | Koral conversation domain; routes absent                                                 | `BACKEND_RUNTIME_MISSING` | Controls remain unavailable until canonical capabilities exist.                                                                           |
| `AiGateway`                                                    | `@asodef/connect-contracts/ai-gateway`                                                   | `MATCHES_CANONICAL`       | AI Gateway is canonical. Koral is a consumer through its adapter.                                                                         |
| `ToolGateway` and governed tools                               | `@asodef/connect-contracts/tool-gateway`                                                 | `MATCHES_CANONICAL`       | Consume `GovernedToolContract`; never reproduce request, result, policy, permission, audit or idempotency types in web code.              |
| Knowledge lifecycle and gateway                                | `@asodef/connect-contracts/knowledge-gateway` and Koral canonical adapter                | `MATCHES_CANONICAL`       | Contracts and adapter are integrated. Only published knowledge may be retrieved; failures remain closed.                                  |
| Knowledge persistence, admin API and stable retrieval          | No verified runtime                                                                      | `BACKEND_RUNTIME_MISSING` | Do not present configured sources, publication success or retrieval availability.                                                         |
| Model Profiles, tool administration and AI evaluations         | AI Gateway registry/policy/evaluation contracts                                          | `BACKEND_RUNTIME_MISSING` | No stable list/draft/review/publish or aggregate analytics API is verified.                                                               |
| Agent Profiles                                                 | Koral `agentProfileKey` to canonical `modelProfileId` binding                            | `BACKEND_RUNTIME_MISSING` | A runtime binding exists, but no administrable Agent Profile contract/API exists.                                                         |
| Domain Events                                                  | `@asodef/connect-contracts/domain-events`                                                | `MATCHES_CANONICAL`       | Consume `DomainEventEnvelope` and `events.publish`; do not reuse an internal conversation event as the generic envelope.                  |
| Automations                                                    | `@asodef/connect-contracts/automation`                                                   | `ADAPTER_REQUIRED`        | Initial EVENT/condition/COMMUNICATION_SEND execution, history, retry and dead-letter runtime exists; administration and other triggers/actions remain absent. |
| Communications and Templates                                   | `@asodef/connect-contracts/communications` and `templates`                               | `ADAPTER_REQUIRED`        | `communications.send` and published source-template rendering exist behind the EMAIL outbox; admin lifecycle APIs remain absent and other channels are contract-only. |
| Recommendations using plan eligibility, price or benefits      | Plans canonicalization gate                                                              | `BLOCKED_BY_PLANS`        | Do not invent recommendation inputs before a published Plans read contract exists.                                                        |
| Plans                                                          | Current Prisma `Plan`/`PlanVersion` plus design gate                                     | `BLOCKED_BY_PLANS`        | No new mapping, mutation, migration or UI write action.                                                                                   |
| Provider health                                                | Current `/api/v1/admin/sistema` response lacks OpenRouter/Meta/WhatsApp fields           | `BACKEND_RUNTIME_MISSING` | Render `UNKNOWN`/`UNAVAILABLE`; never infer connection or health from browser state or configuration.                                     |

No duplicate `DataClassification`, `GatewayRequestContext`, `DomainEvent`, `communications.send`, `GovernedToolContract`, Koral handoff states or AI gateway types are maintained by the Control Plane.

## Inbox API requirements

Canonical prefix: `/api/v1/admin/koral/conversations`.

| Capability                     | Exact contract                                                                                                                | Classification            | RBAC / step-up                                      | Version, idempotency and audit                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| List conversations             | `GET /api/v1/admin/koral/conversations?status&page&pageSize`                                                                  | `MATCHES_CANONICAL`       | `koral.conversations.read`; no step-up              | Read-only.                                                                                   |
| Filter queues                  | Add canonical queue read capability and bounded `queueId`, `priority`, `assigneeUserId`, `channel`, `tag`, `slaState` filters | `BACKEND_RUNTIME_MISSING` | `koral.conversations.read`; no step-up              | Queue/SLA ownership and PII-safe response must be canonical.                                 |
| Get conversation               | `GET /api/v1/admin/koral/conversations/:id`                                                                                   | `ADAPTER_REQUIRED`        | `koral.conversations.read`; no step-up              | Bind a declared transport DTO; do not consume Prisma objects in the browser.                 |
| Takeover / assign              | `POST /api/v1/admin/koral/conversations/:id/assignments`                                                                      | `MATCHES_CANONICAL`       | `koral.conversations.manage`; step-up               | `expectedVersion`, UUID idempotency key, canonical 409; sanitized assignment/takeover audit. |
| Release without Koral takeover | Canonical release command is absent                                                                                           | `BACKEND_RUNTIME_MISSING` | `koral.conversations.manage`; step-up required      | Require reason, expected version and idempotency key; audit release.                         |
| Return to Koral                | `POST /api/v1/admin/koral/conversations/:id/return-to-koral`                                                                  | `MATCHES_CANONICAL`       | `koral.conversations.manage`; step-up; active owner | Compare-and-swap, idempotent replay, 409 and `RETURNED_TO_KORAL`.                            |
| Add internal note              | `POST /api/v1/admin/koral/conversations/:id/internal-notes`                                                                   | `MATCHES_CANONICAL`       | `koral.conversations.manage`; no step-up            | UUID idempotency key; append-only; note body excluded from audit.                            |
| Change priority                | Canonical priority command is absent                                                                                          | `BACKEND_RUNTIME_MISSING` | `koral.conversations.manage`; step-up required      | Require reason, priority, expected version and idempotency key; audit before/after.          |
| Resolve                        | Canonical resolve command is absent                                                                                           | `BACKEND_RUNTIME_MISSING` | `koral.conversations.manage`; step-up required      | Require summary, expected version and idempotency key; audit transition.                     |
| Close                          | Canonical close command is absent                                                                                             | `BACKEND_RUNTIME_MISSING` | `koral.conversations.manage`; step-up required      | Require reason, expected version and idempotency key; enforce terminal transition and audit. |

Canonical handoff states are `AI_ACTIVE`, `WAITING_USER`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE`, `WAITING_INTERNAL`, `RESOLVED` and `CLOSED`. `HUMAN_ACTIVE` and `HUMAN_REQUIRED` suppress Koral auto-reply. The UI must not present Koral as actively attending while a human owns the interaction.

All errors use the platform envelope: validation 400, authentication 401, permission/step-up 403, not found 404, version/ownership/idempotency conflict 409 and rate limit 429.

## Koral and Communications Admin requirements

The paths below are dependency requirements, not implemented endpoints. Lifecycle resources need bounded `READ`, `CREATE_DRAFT`, `UPDATE_DRAFT`, `SUBMIT_REVIEW`, `PUBLISH`, `RETIRE` and `ROLLBACK` operations where the canonical lifecycle permits them.

| UI domain                               | Required base path                                                    | Canonical source                                                   | Classification / constraint                                                        |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Model Profiles                          | `/api/v1/admin/koral/model-profiles`                                  | AI Gateway `ModelProfile`                                          | `BACKEND_RUNTIME_MISSING`                                                          |
| Agents                                  | `/api/v1/admin/koral/agent-profiles`                                  | Runtime binding only; admin contract absent                        | `BACKEND_RUNTIME_MISSING`                                                          |
| Tools                                   | `/api/v1/admin/koral/tools`                                           | `GovernedToolContract` and registry                                | `BACKEND_RUNTIME_MISSING`                                                          |
| Knowledge                               | `/api/v1/admin/koral/knowledge`                                       | Knowledge source/document/version/collection/publication contracts | `BACKEND_RUNTIME_MISSING`; preserve canonical `APPROVED` and rollback reference.   |
| Recommendations                         | `/api/v1/admin/koral/recommendation-policies`                         | No independent canonical contract                                  | `BLOCKED_BY_PLANS` for plan-dependent policies.                                    |
| Automations                             | `/api/v1/admin/koral/automations`                                     | Automation/Version/Execution/DeadLetter contracts                  | `BACKEND_RUNTIME_MISSING`; activation, execution, retry and requeue stay disabled. |
| Analytics/evaluations                   | `/api/v1/admin/koral/analytics` and `/api/v1/admin/koral/evaluations` | AI eval/usage contracts                                            | `BACKEND_RUNTIME_MISSING`; immutable results are read-only.                        |
| Communication templates                 | `/api/v1/admin/communications/templates`                              | Template/Version/preview contract                                  | `BACKEND_RUNTIME_MISSING`                                                          |
| Communication automation/history/config | `/api/v1/admin/communications/{automations,history,configuration}`    | Automation and Communications contracts                            | `BACKEND_RUNTIME_MISSING`; sending and provider configuration stay disabled.       |

Required operation shape: list/detail reads; idempotent draft creation; draft-only patch with expected version; explicit review/publish/retire/rollback commands; immutable preview and semantic diff. Mutations require reason, expected version, idempotency key, RBAC and before/after audit. Publish, retire and rollback require step-up at minimum. Runtime consumers resolve published versions only. Secrets, credentials, hidden reasoning, raw prompts, rendered bodies and recipients are excluded from administrative audit responses.

## Plans dependency

The current Prisma `Plan`/`PlanVersion` model is not the approved complete plan contract. Canonical decisions and implementation remain pending for codes, feature/benefit schemas, pricing/currency vocabulary, visibility, publication lifecycle, effective-date behavior and historical status. Therefore `/admin/planes`, public plan consumers, Koral plan-aware knowledge/tools/recommendations and plan-attributed analytics remain `BLOCKED_BY_PLANS`.

The intended design keeps one stable PostgreSQL Plan identity and immutable versions, with one published-version pointer for Admin, public pages, Koral, CRM and Contracts. Master/Firebird remains an optional projection. This branch implements no backend, mapping or migration.

## Runtime and technical-state truth

- Automation contracts are canonical; initial EVENT execution exists, while administration and SCHEDULE/MANUAL runtime remain `NOT_CONFIGURED`.
- Communications contracts are canonical; EMAIL is `REAL_EXISTING_ADAPTER` through the encrypted outbox. The governed tool remains `REVIEW`, and other transports remain `CONTRACT_ONLY`.
- Koral functional/business configuration remains under Koral. OpenRouter, Meta, WhatsApp and other provider health remains under Sistema.
- Technical states are `HEALTHY`, `DEGRADED`, `UNAVAILABLE`, `UNKNOWN`, `NOT_CONFIGURED` and `DISABLED`.
- A provider without evidence is `UNKNOWN`, never `HEALTHY`. A capability without runtime is `NOT_CONFIGURED` or `UNAVAILABLE`, never simulated success.
