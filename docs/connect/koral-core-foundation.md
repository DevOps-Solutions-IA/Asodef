# Koral Core Foundation — brownfield audit and contracts

Baseline: `origin/main` at `662cb7bfba6f1429d01f86a5e232db1a193a3c67`.

## Brownfield decision matrix

| Area | EXISTING | REUSE / EXTEND | NEW | AVOID DUPLICATION |
|---|---|---|---|---|
| API | NestJS modules, URI v1, global validation/error model | Reuse module/controller/DTO conventions | `KoralConversationsModule` | No parallel API runtime |
| Persistence | Prisma/PostgreSQL, additive migrations, UUIDs, DB constraints | Extend the single Prisma schema | Channel-neutral conversation tables | No direct WhatsApp-owned conversation table |
| Auth/RBAC | JWT session validation, `RequirePermissions`, normalized permission catalog | Add `koral.conversations.read/manage` | None | No Koral-specific auth system |
| Step-up | Global `StepUpGuard` and `RequireStepUp` | Protect assignment/takeover and return-to-Koral | None | No second recent-auth mechanism |
| Audit | Transactional domain audit patterns, SecurityEvents for auth denials | ConversationEvent is the append-only, FK-backed domain timeline | Koral event vocabulary | No generic unbounded JSON audit clone; no message bodies in events |
| Redis | Shared `RedisService` | Reserved for later ephemeral orchestration/rate limits | None in this foundation | PostgreSQL remains authoritative for messages/ownership |
| Events/outbox | Durable Notification Outbox and communication logs | Reuse their durability principles later through gateways | No delivery worker in Agent 1 scope | No fire-and-forget AI delivery |
| Web | React admin architecture and permission-aware navigation | Future queue UI can consume the v1 admin API | No Web Chat endpoint in this wave | No public chat before consent/identity contracts exist |
| AI | No existing provider/orchestrator module | Depend on Agent 2 through typed `AiGateway` | Orchestrator interfaces and policy boundary | No OpenRouter client, model hardcoding or fake gateway |

## Public contract inventory (v1)

The TypeScript contracts in `apps/api/src/modules/koral-conversations/contracts` are the source of truth:

- Channel contract: normalized input/output, delivery errors, adapter permissions, audit and idempotency semantics.
- Gateway contract: `AiGateway`, `ToolGateway`, `KnowledgeGateway`; every request carries permissions, consent purposes and PII policy. Koral never receives SQL/Prisma/Redis access through these interfaces.
- Orchestrator contract: context, analysis, agent-profile selection, policy decision, handoff and response validation. It deliberately contains no provider/model and no monolithic prompt.

Agent 2 dependency: provide a production `AiGateway` implementation conforming to `KORAL_GATEWAY_CONTRACT_VERSION=1.0.0`. Agent 1 does not invent its configuration lifecycle or provider behavior.

## Domain and safety invariants

- A `Conversation` is channel-neutral; channel state is isolated in `ConversationChannelSession`.
- Inbound idempotency is `(channel_session_id, external_message_id)` and processing is serialized with a transaction-scoped advisory lock.
- A partial unique index permits only one unreleased assignment per conversation.
- Assignment uses optimistic `Conversation.version` compare-and-swap; stale tabs receive conflict instead of overwriting ownership.
- `HUMAN_ACTIVE` and `HUMAN_REQUIRED` always suppress Koral auto-reply. Only explicit `return-to-koral` restores `AI_ACTIVE`.
- Assignment/takeover and return require `koral.conversations.manage` plus server-verified step-up. Reads and notes are separately permission-gated.
- Conversation events are append-only through the service contract and store before/after state, actor, request/correlation, result and sanitized metadata. Message bodies, credentials and hidden model reasoning never enter event metadata.
- Attachments store metadata only; no file payload is stored by this domain.

## API contract summary

All routes are `/api/v1/admin/koral/conversations` and authenticated.

| Operation | Input | Output | Permission | Step-up | Idempotency | Audit |
|---|---|---|---|---|---|---|
| List/detail | query/path schema | conversation/list schema | `koral.conversations.read` | No | Read-only | No mutation |
| Assign/takeover | assignee, priority, expectedVersion, idempotencyKey, reason | conversation with ownership timeline | `koral.conversations.manage` | Yes | event key + optimistic version | `ASSIGNMENT_CREATED` / `ASSIGNMENT_TAKEN_OVER` |
| Return to Koral | expectedVersion, idempotencyKey, reason | conversation | `koral.conversations.manage` | Yes | event key + optimistic version | `RETURNED_TO_KORAL` |
| Internal note | body, idempotencyKey | note metadata/body | `koral.conversations.manage` | No | exact note key | `INTERNAL_NOTE_ADDED` without note body |

Safe errors use the platform error envelope: validation (400), authorization (403), not found (404), concurrent/idempotency conflict (409), authentication/session errors from global guards (401/403). No infrastructure details are exposed.

No administrable AI configuration is introduced here. Agent profiles, policies, prompts and model routing must use the approved `DRAFT → REVIEW → PUBLISHED → RETIRED/ROLLED_BACK` lifecycle in their owning control-plane module.
