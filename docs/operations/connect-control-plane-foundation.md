# ASODEF Connect — Admin Control Plane foundation

Status: frontend foundation on `codex/connect-control-plane`. No deploy, production mutation, secret handling or backend endpoint was introduced.

## Architecture boundary

ASODEF Connect remains the ecosystem, Koral is the intelligence/orchestration layer, and the Admin Panel is its Control Plane. The UI never connects an LLM to SQL, Prisma, PostgreSQL, Redis, Firebird or infrastructure. Enterprise actions remain dependent on a canonical Tool Gateway contract that must enforce RBAC, consent, PII policy, step-up, validation, rate limiting, idempotency and audit.

The foundation adds real routes and accessible dependency states, not placeholder APIs. Conversation and Inbox routes consume Koral Core's canonical `koral.conversations.read` permission. Configuration routes remain protected by the existing `settings.manage` permission until their owning backend defines a stricter canonical matrix.

## Information architecture

| Area                  | Routes                                                                                                                     | Behavior in this foundation                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Gestión / Planes      | `/admin/planes`                                                                                                            | Approved UI schema, single-source intent, lifecycle and dependency state                                       |
| Koral                 | `/admin/koral/{resumen,conversaciones,inbox,conocimiento,agentes,herramientas,recomendaciones,automatizaciones,analitica}` | Governed capability surfaces; no operational data or writes                                                    |
| Comunicaciones        | `/admin/comunicaciones/{plantillas,automatizaciones,historial,configuracion}`                                              | Functional business configuration, separate from transport health                                              |
| Sistema / Proveedores | `/admin/sistema?section=proveedores`                                                                                       | Technical OpenRouter, WhatsApp, Meta and provider health; values stay unknown until supplied by the system API |

The existing Admin shell, account controls, responsive drawer, focus management, route lazy loading and PermissionRoute boundary are preserved.

## Canonical contract consumption

The frontend does not maintain copies of backend schemas. The first-wave Zod manifests were removed after reviewing the now-integrated PRs #19, #20 and #21. At `main` `0c3ed988c2c1c873363e41ae4c4855e373ed8c7a`, `@asodef/connect-contracts` owns the canonical AI, Tool, Knowledge, Domain Event, Automation, Communications and Template contracts. Koral consumes gateway contracts through its integrated adapters. The exact canonical sources, adapter gaps and missing runtimes are recorded in `docs/connect/control-plane-api-dependency-map.md`.

Inbox retains only an explicit UI projection for ownership rendering. Koral Core remains authoritative for conversation status, assignment, optimistic versioning, idempotency, permissions and audit. The projection uses the canonical `activeAssigneeUserId` and conversation `version` vocabulary, fails closed when ownership cannot be verified and blocks actions when another advisor owns the case. During canonical human-active handling, Koral auto-reply is suppressed and the UI must not imply active AI attention.

## Publishing governance

Editable model, agent, tool, automation and communications surfaces present the required lifecycle:

`DRAFT -> REVIEW -> PUBLISHED -> RETIRED`

The configuration flow recognizes `ROLLED_BACK` for reversible histories. Knowledge follows the canonical flow `DRAFT -> REVIEW -> APPROVED -> PUBLISHED -> RETIRED`. Preview, semantic diff and audit evidence are required before publication. No publish action is enabled in this foundation.

## Plans dependency (superseded by canonical implementation)

The canonical Plans implementation now supplies additive fields, governed
contracts and one application read service for Public, Koral, CRM and
Contracts. Legacy rows are preserved as `LEGACY_UNMAPPED`; no status or
commercial backfill is inferred. Plans Admin consumes the real read API.

## Provider health and secrets

The current `/api/v1/admin/sistema` response has no OpenRouter, WhatsApp or Meta health contract. The UI therefore shows connection, health and usage as unknown/unavailable. It does not inspect environment configuration and never renders credentials, API keys, tokens or internal endpoints.

Automation, Communications and Template contracts are integrated, but their administrative/execution runtimes are not. The UI exposes only their governed surfaces and disabled dependency states: it does not execute an automation, requeue dead letters or send a communication. Canonical communications transports, including EMAIL, remain `CONTRACT_ONLY`.

## Delivery matrix

```text
CONTROL_PLANE_ARCHITECTURE=IMPLEMENTED_FRONTEND_FOUNDATION
PLANS_ADMIN=CANONICAL_READ_CONSUMER
KORAL_ADMIN=FOUNDATION_READY
INBOX_UI=OWNERSHIP_GUARD_READY_BACKEND_BLOCKED
KNOWLEDGE_UI=FOUNDATION_READY
AUTOMATION_UI=FOUNDATION_READY
COMMUNICATIONS_UI=FOUNDATION_READY
MODEL_PROFILE_UI=FOUNDATION_READY
SECRETS_RENDERED=NO
RBAC_PRESERVED=YES_CANONICAL_PLANS_AND_CONVERSATION_PERMISSIONS
PRODUCTION_TOUCHED=NO
```
