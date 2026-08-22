# ASODEF Connect — Business Foundation and AI Gateway

## Scope and dependency

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

Each published tool has a version, bounded input/output schemas, structured
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
