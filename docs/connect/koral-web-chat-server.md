# Koral Web Chat server contract

Version `1.0.0` exposes four public browser operations:

- `POST /api/v1/koral/web-chat/bootstrap`
- `GET /api/v1/koral/web-chat/history`
- `POST /api/v1/koral/web-chat/messages`
- `POST /api/v1/koral/web-chat/identity/claim`

The sole browser capability is a 256-bit opaque
`__Host-asodef_koral_web` cookie. It is `Secure`, `HttpOnly`, host-only,
`SameSite=Strict`, and is rotated on every bootstrap. PostgreSQL stores only a
domain-separated HMAC digest plus server-authoritative idle, absolute expiry
and revocation state. Internal conversation, channel-session and message IDs
are not projected; public message references are session-bound opaque values.
If a supplied cookie is invalid, expired, revoked, or loses a concurrent
rotation, bootstrap returns the same generic 401 and clears it. Only a later
bootstrap with no cookie creates a new session, preventing conversation forks.

Every request is scoped through the resolved Web Chat session. A
conversation ID, external session ID, cursor or public message reference is
never accepted as authorization. History includes only inbound/outbound text
belonging to that exact channel session; internal notes, events, identity
evidence, attachments and gateway references remain private. Cursors are
encrypted, authenticated, session-bound and expire after 15 minutes.

Mutation requests require an exact configured Origin, acceptable Fetch
Metadata and JSON content type. Global DTO validation rejects unknown fields.
Redis-backed IP and session limits fail closed. A UUID `clientMessageId` is
exactly-once within the channel session; reuse with normalized payload drift
returns `WEB_CHAT_MESSAGE_DRIFT`.

Anonymous identity may progress only to `CLAIMED`. Claiming does not match a
contact, authenticate a portal user or establish consent. The identity ledger,
session assurance and sanitized event are committed atomically. Higher
assurance continues to require the existing server-owned identity runtime.

`KoralWebChatRuntimeAdapter` consumes only the canonical
`KoralOrchestrationPipeline`. It does not import OpenRouter or create Tool or
Knowledge Gateway substitutes. Until a concrete governed pipeline is
registered, inbound messages remain durable and the public projection reports
AI auto-reply unavailable. `HUMAN_REQUIRED`, `HUMAN_ACTIVE`, or any active
assignment always suppresses orchestration; the outbound commit boundary
rechecks status, assignment and conversation version under the conversation
advisory lock.

This change is additive migration 49 on its source branch. PR #30 independently
owns another candidate migration 49; whichever branch integrates second must
rebase, renumber its new migration to 50, and rerun zero-drift certification.
