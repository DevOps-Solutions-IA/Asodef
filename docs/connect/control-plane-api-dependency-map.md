# ASODEF Connect — Control Plane truth map

Evidence date: 2026-08-26. Base: `e4da369ff6bb1051906f787c3c5f9b4a339b54ff`.

The Control Plane presents server-authoritative state. It does not infer permissions, ownership, model availability, executable tools, automation status, Knowledge eligibility, provider health, token usage or cost.

## Koral navigation

| Section | Route | Server truth | Mutations | Final status |
| --- | --- | --- | --- | --- |
| Resumen | `/admin/koral/resumen` | `GET /api/v1/admin/koral/control-plane`; conversations, handoffs, Knowledge, agent configuration, tools and automations | None | `REAL_CONNECTED` |
| Conversaciones | `/admin/koral/conversaciones` | `GET /api/v1/admin/koral/conversations` and `/:id`; persisted messages, ownership, assurance, Knowledge audits and event correlations | None | `REAL_CONNECTED` |
| Inbox | `/admin/koral/inbox` | Human Inbox list/detail and canonical command endpoints | Assignment, takeover/transfer, release, return, priority and state transitions with server RBAC, step-up, CAS, idempotency and audit | `REAL_CONNECTED`; human outbound remains `UNAVAILABLE` |
| Conocimiento | `/admin/koral/conocimiento` | Knowledge items, versions, sources, snapshots, retrieval and lifecycle | Canonical Knowledge lifecycle only | `REAL_CONNECTED` |
| Agentes | `/admin/koral/agentes` | `GET /api/v1/admin/koral/control-plane/runtime/agents`; source-controlled agent/model binding and effective configuration | None; there is no dynamic agent registry | `REAL_CONNECTED_READ_ONLY` |
| Herramientas | `/admin/koral/herramientas` | `GET /api/v1/admin/koral/control-plane/tools`; canonical catalog and sanitized schemas | None; Tool Gateway has zero registered executors | `REAL_CONNECTED_READ_ONLY` |
| Recomendaciones | hidden | No canonical recommendation decisions, evidence or projection | None | `HIDDEN_NO_CANONICAL_DOMAIN` |
| Automatizaciones | `/admin/koral/automatizaciones` | `GET /api/v1/admin/koral/control-plane/automations`; definitions, versions, executions, steps, retries and dead letters | None; no governed admin commands exist | `REAL_CONNECTED_READ_ONLY` |
| Analítica | `/admin/koral/analitica` | `GET /api/v1/admin/koral/control-plane/analytics`; bounded aggregates from persisted runtime tables | None | `REAL_CONNECTED_READ_ONLY` |

All Control Plane projection endpoints require `settings.manage`. Conversation reads require `koral.conversations.read`; Inbox commands require `koral.conversations.manage`; Knowledge keeps its canonical `knowledge.*` permissions. Route visibility is only a convenience: every server endpoint enforces its permission independently.

## Runtime boundaries

- Provider configuration establishes `CONFIGURED`, `DISABLED` or `MISCONFIGURED`. It is not a provider health probe and never produces `HEALTHY`.
- Model IDs, fallback order, token bounds and circuit policy come from source-controlled model profiles plus validated runtime configuration. Secret values are never returned.
- Knowledge availability is backed by the real Knowledge persistence and retrieval runtime.
- The Tool contract catalog is real, but no Tool Gateway executor is registered. `CONTRACT_PRESENT != EXECUTABLE`; executable count is zero and the UI has no execute action.
- Automation supports real EVENT processing and `COMMUNICATION_SEND`. SCHEDULE, MANUAL, TOOL_CALL and EMIT_EVENT are not presented as executable. The Control Plane is read-only until governed admin commands exist.
- AI invocation details, tokens and costs are not stored durably. The analytics response states this gap and does not fabricate charts or costs.
- Human ownership is real. `HUMAN_ACTIVE => AI_AUTORESPONSE=OFF`. Human outbound delivery has no canonical adapter yet and remains visibly disabled. External channels never report fake delivery success.
- Recommendations remain absent until a canonical recommendation domain exists.

## Conversation contract

Canonical prefix: `/api/v1/admin/koral/conversations`.

| Capability | Endpoint | Permission | Governance |
| --- | --- | --- | --- |
| List/filter/page | `GET /` | `koral.conversations.read` | Bounded server filters for status, priority, assignee, channel, SLA, queue and search |
| Detail | `GET /:id` | `koral.conversations.read` | Sanitized participants, messages, assignments, notes, events, assurance, Knowledge retrieval and channel sessions |
| Eligible assignees | `GET /eligible-assignees` | `koral.conversations.manage` | Active users with the canonical manage permission |
| Assign/takeover/transfer | `POST /:id/assignments` | `koral.conversations.manage` | Step-up, expected version, UUID idempotency, advisory lock and audit |
| Release | `POST /:id/release` | `koral.conversations.manage` | Step-up, ownership, CAS, idempotency and audit |
| Return to Koral | `POST /:id/return-to-koral` | `koral.conversations.manage` | Step-up, ownership, CAS, idempotency and audit |
| Priority | `POST /:id/priority` | `koral.conversations.manage` | Step-up, CAS, idempotency and audit |
| Resolve/close | `POST /:id/status-transitions` | `koral.conversations.manage` | Step-up, transition invariants, CAS, idempotency and audit |
| Read state | `POST /:id/read` | `koral.conversations.read` | Per-user persisted read projection |
| Internal note | `POST /:id/internal-notes` | `koral.conversations.manage` | Append-only persisted note; body excluded from audit metadata |

Canonical states are `AI_ACTIVE`, `WAITING_USER`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE`, `WAITING_INTERNAL`, `RESOLVED` and `CLOSED`. The UI renders the persisted state and never guesses thread ownership from a subject or channel.

## Analytics sources

The bounded analytics projection uses only `Conversation`, `ConversationEvent`, `WebChatMessageProcessing`, `KnowledgeRetrievalAudit`, `ConnectAutomationExecution` and `ConnectAutomationDeadLetter`. No durable provider latency, invocation, token or cost store exists, so those values are not displayed. Technical provider health remains owned by Sistema.

## Test contract

- Unit and integration tests cover authorization, bounded DTOs, configuration truth, sanitized output and frontend loading/empty/error/non-empty states.
- Chromium E2E calls compiled Web/API with real PostgreSQL and Redis; it does not intercept network requests.
- The automation E2E fixture is guarded to isolated `asodef_ci_*` databases and dispatches through the canonical `DomainEventDispatcherService`; the notification transport is in-memory under `NODE_ENV=test`.
- Local Preview provider verification calls real OpenRouter and checks that the resulting conversation is visible in Admin Conversaciones.
- Synthetic fixtures never run in production and are removed with the isolated runtime.
