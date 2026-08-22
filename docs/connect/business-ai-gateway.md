# ASODEF Connect — Business Foundation and AI Gateway

## Canonical ownership and dependency

Public cross-module contracts live in the pure workspace package
`@asodef/connect-contracts`. The package imports neither Nest, Prisma nor an
application module. API owns provider/runtime policy and the executable tool
registry; Koral owns conversation/orchestration state and imports the shared
gateway interfaces. Neither side imports the other, preventing an
`apps/api <-> Koral` cycle.

PR #19's local `koral-conversations/contracts/gateway.contract.ts` is therefore
an integration dependency to remove when PR #19 is resynchronized. Its flat
actor context maps to the canonical `identity`, `audit` and `policy` sections;
`agentProfileKey` maps to `modelProfileId`; and uppercase message roles are
normalized to the canonical lowercase vocabulary by the Koral adapter. Koral's
channel, handoff, conversation-state and orchestration contracts remain
Koral-owned. No provider key crosses this boundary.

| Concern            | PR #19 local contract                               | Canonical resolution                                                                       |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `AiGateway`        | local request/result union                          | import canonical gateway; adapter maps `agentProfileKey` to `modelProfileId`               |
| `ToolGateway`      | `toolKey`, flat context                             | import canonical versioned tool request and structured result                              |
| `KnowledgeGateway` | collection keys and local result                    | import canonical published-publication retrieval boundary                                  |
| identity           | actor type/id plus permissions                      | canonical principal plus mandatory effective actor and identity level                      |
| audit/correlation  | correlation and conversation IDs mixed into context | canonical `audit` context with correlation, conversation, request and causation IDs        |
| privacy            | consent keys and PII policy                         | canonical `policy` context also requires purpose, consent decision and data classification |
| errors             | gateway-specific local unions                       | canonical discriminated results with normalized, retryable error codes                     |
| timeouts           | absent                                              | canonical bounded timeout contract; runtime enforcement remains a next-wave gate           |
| structured output  | AI-only response schema                             | canonical AI schema policy and published Tool input/output schemas                         |

PR #19 must not retain aliases with identical gateway names after adopting the
package. Its orchestrator dependency interface may reference the imported
types, while Koral-specific errors and state transitions remain local.

This contract layer is stacked on the resynchronized Phase 2 Business Core PR.
It reuses the twelve CRM tool schemas and the existing CRM, Companies,
Partners, Contracts, PQR, Payments, Consent and Reports application services.
It adds no route, database table, migration, chatbot, deployment code or direct
data client.

Koral depends only on `AiGateway`. `OpenRouterProvider` maps that stable request
to an `OpenRouterTransport`; the privileged transport is the only future
component allowed to resolve provider credentials. Neither Koral nor any public
contract accepts, returns or logs provider keys.

## Governed inference

The order of enforcement is:

1. Resolve the latest `PUBLISHED` `ModelProfile` version.
2. Match the declared purpose and bounded token limits.
3. Apply `DataClassificationPolicy` before any external-provider call.
4. Enforce structured-output and tool-calling policy.
5. Enforce request and daily cost ceilings, failing closed on unknown pricing
   when configured.
6. Route only through allowed providers and declared models. Fallback applies
   only to retryable provider/model availability failures.
7. Meter model, token and cost usage with actor, purpose and correlation ID.

Model profiles carry the lifecycle `DRAFT -> REVIEW -> PUBLISHED ->
RETIRED/ROLLED_BACK`. Runtime resolution excludes every non-published version.

## Data classification

The ordered vocabulary is `PUBLIC`, `INTERNAL`, `PERSONAL`, `SENSITIVE`, and
`HIGHLY_SENSITIVE`. A profile explicitly declares allowed, denied,
consent-required and maximum external classifications. Unknown or omitted
authorization context fails closed; classification is never inferred as safe.

## Tool Gateway

Each tool has exactly one registry status: `PUBLISHED`, `REVIEW`, `DISABLED` or
`RETIRED`. Only `PUBLISHED` versions resolve for execution. Each published tool
has a version, bounded input/output schemas, structured
errors, a real RBAC permission, minimum identity level, confirmation rule,
actor/tool-scoped rate limit, idempotency semantics, timeout, audit/redaction
contract, data classification and one existing application-service method.
Ownership/tenant checks remain enforced by that brownfield service.
`directDataAccess` is permanently false: tool execution cannot call SQL,
Prisma, PostgreSQL, Redis or Firebird.

The catalog preserves the twelve Phase 2 CRM/Companies/Partners contracts. Ten
are backed by existing methods and published; `get_lead` and `update_lead`
remain in `REVIEW` because the named `CrmService` methods do not exist yet.
The gateway rejects both rather than fabricate execution. Additional safe read
contracts are backed by existing Contracts, PQR, Payments, Consent and Reports
services. Plans is an explicit dependency because no Plans service
contract exists. Communications is also an explicit dependency: the current
controller only provides public unsubscribe and must not be misrepresented as a
governed send command. Neither dependency is executable.

## Knowledge lifecycle

`KnowledgeSource`, `KnowledgeDocument`, `KnowledgeVersion`,
`KnowledgeCollection` and `KnowledgePublication` use `DRAFT -> REVIEW ->
APPROVED -> PUBLISHED -> RETIRED`. Koral reads only a non-empty `PUBLISHED`
publication. This contract intentionally does not create an unreviewed RAG
pipeline or persistence model.

## Evaluation lifecycle

Versioned eval cases cover golden conversations, knowledge accuracy, tool
selection, tool arguments, PII leakage, policy, jailbreak, hallucination and
handoff. Published suites declare blocking safety dimensions and minimum pass
rate. Results retain digests and findings, not raw secrets or prompts. The eval
contract is evidence for a future publication gate; it does not silently
publish a model profile.

## Deferred integrations

- Control Plane persistence and publication APIs depend on the separate
  Connect Control Plane contract.
- Koral orchestration depends on the separate Koral Core contract.
- Communications send tools depend on an authenticated, consent-aware,
  suppression-aware, idempotent and audited command contract.
- Plans tools depend on a versioned Plans application-service contract.

These dependencies are documented rather than invented, preserving contract-
first integration between isolated agents.

## OpenRouter next-wave runtime checklist

The contracts and fail-closed policy objects are ready for runtime
implementation, but no provider credential or outbound HTTP transport is
configured in this wave. The next wave must close every item before enabling
inference:

- resolve `OPENROUTER_API_KEY` only in the privileged transport from the
  approved runtime secret channel; never from requests, normal database rows,
  Koral, logs or Admin responses;
- enforce HTTPS with an allowlisted OpenRouter origin, certificate validation,
  bounded body sizes and redacted transport diagnostics;
- apply the request's bounded timeout with cancellation; never let retries
  extend the declared deadline;
- retry only retryable transport/provider failures with bounded backoff; never
  retry tool side effects or policy/schema failures;
- resolve only a `PUBLISHED` model profile, allowed provider and declared
  primary/fallback models;
- apply fallback only after classification, authorization and cost policy, and
  re-evaluate provider policy for each route;
- require and validate structured output whenever the profile demands it;
- expose only `PUBLISHED` tools and re-run RBAC, identity, consent,
  confirmation, rate limit, idempotency and audit at invocation time;
- capture provider/model token usage and normalized cost without prompt or
  secret content; fail closed when required pricing is unknown;
- emit actor, model-profile version, correlation, routing decision, policy
  outcome and redacted result audit evidence;
- run the data-classification gate before serialization or network activity;
- test credential absence, HTTPS/host enforcement, timeout, retry/fallback,
  structured-output rejection, tool denial, usage/cost and audit redaction.
