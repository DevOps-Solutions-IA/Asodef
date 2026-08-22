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
| AI | Agent 2 PR #20 owns the canonical AI, model, tool, knowledge and classification contracts | Consume them through Koral-named adapters | Orchestrator interfaces and policy boundary | No copied gateway/model/tool/classification definitions, OpenRouter client or fake gateway |

## Public contract inventory (v1)

The TypeScript contracts in `apps/api/src/modules/koral-conversations/contracts` are the source of truth:

- Channel contract: normalized input/output, delivery errors, adapter permissions, audit and idempotency semantics.
- Gateway consumer contract: Koral-normalized adapters around Agent 2's canonical `AiGateway` and `ToolGateway`. PR #20 does not yet expose a runtime knowledge retrieval interface, so `KoralKnowledgeResolver` is explicitly a temporary consumer port rather than a canonical `KnowledgeGateway` definition.
- Orchestrator contract: context, analysis, agent-profile selection, policy decision, handoff and response validation. It deliberately contains no provider/model and no monolithic prompt.
- Identity dependency contract: stable identity/contact/portal references, channel identities, six ordered assurance levels, consent state and verified-attribute evidence. It never performs implicit matching or identity mutation.

Agent 2 dependency: publish its canonical gateway package/path before cross-branch integration. Koral adapters map to that package but do not own or duplicate model profiles, tools, classifications, errors or knowledge lifecycle.

## PR #19 / PR #20 contract reconciliation

Compared against Agent 2 head `f52f668049e1f677e0b7d851286434deac33ae92`:

| Concept | Classification | Reconciliation |
|---|---|---|
| `AiGateway` method | COMPATIBLE | Both use async inference. Koral now exposes only an adapter; Agent 2 owns `AiGatewayRequest`, `AiInvocationContext` and `AiGatewayResponse`. |
| `ToolGateway` method | COMPATIBLE | Agent 2's canonical method is `invoke`; Koral's former `execute` contract was removed. The adapter preserves tool version, confirmation and idempotency without retries. |
| Knowledge gateway | NEEDS_ADAPTER | PR #20 owns knowledge lifecycle/publication but has no retrieval gateway interface. Koral uses the non-canonical `KoralKnowledgeResolver` until Agent 2 publishes one. |
| Model / `ModelProfile` | CONFLICT | `agentProfileKey` is a Koral routing key, not a model profile ID. The adapter must resolve it to a published Agent 2 `modelProfileId`; Koral defines no model shape. |
| Tool execution result | NEEDS_ADAPTER | Agent 2 returns `data/error/meta`; Koral consumes normalized success/rejection plus audit reference, replay state and correlation ID. |
| Structured output | COMPATIBLE | Agent 2 owns JSON schema enforcement and returns `structuredOutput`; Koral treats it as unknown until outbound validation. |
| Errors | NEEDS_ADAPTER | Agent 2 owns canonical error codes. Koral retains only orchestration reason codes and must not translate an unknown code to success. |
| Audit context | NEEDS_ADAPTER | Agent 2 requires actor, purpose, classification and correlation; Koral adds conversation and resolved identity references. The adapter narrows and maps without raw PII. |
| Identity context | CONFLICT | PR #20 uses `AUTHENTICATED/MFA_VERIFIED/STEP_UP_VERIFIED`; Connect's canonical six-level vocabulary has no `MFA_VERIFIED`. Mapping must fail closed until Agent 2 accepts the shared vocabulary or publishes an explicit policy. |
| Data classification | DUPLICATED (REMOVED) | Koral's former free-form classification result was removed as a gateway definition. Agent 2 exclusively owns the ordered classification vocabulary and policies. |
| Correlation IDs | IDENTICAL | Both require correlation IDs; adapters preserve them end-to-end and conversation events record them. |
| Timeout semantics | NEEDS_ADAPTER | Agent 2 tool contracts cap one attempt and specify milliseconds; Koral propagates one immutable absolute deadline and never retries mutations. |

## Orchestration integration sequence

The versioned `KORAL_ORCHESTRATION_STEPS` contract fixes the order:

1. receive a normalized message;
2. resolve its conversation idempotently;
3. build a minimized safe context with identity, consent, permissions, classification and deadline;
4. evaluate Koral policy;
5. invoke the Agent 2 AI Gateway through the consumer adapter;
6. receive and validate any tool request;
7. invoke the Agent 2 Tool Gateway;
8. return the governed tool result to the conversation/inference context;
9. continue inference only while policy and the original deadline allow it;
10. validate structured and outbound content;
11. hand off when policy, identity, safety or response validation requires it;
12. append sanitized conversation and audit references transactionally.

The adapter may only narrow permissions and consent. It cannot extend deadlines, retry tool mutations, resolve an unpublished model profile, infer a safer data classification or elevate identity assurance.

## Identity resolution dependency

`ResolvedIdentityContext` contains `identityId`, optional `contactId` and `portalUserId`, channel identities, consent state and verified attributes. Assurance is ordered as `ANONYMOUS → CLAIMED → MATCHED → VERIFIED → AUTHENTICATED → STEP_UP_VERIFIED`. Resolution is read-only: ambiguous evidence fails closed and never creates, merges or upgrades an identity implicitly.

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
