# Koral Web Chat — frontend contract

This branch implements only the Web Chat browser client and accessible widget.
It does not add a controller, persistence, gateway, provider, model, fake
response, production configuration or deployment.

## Canonical server transport

The browser consumes the server-owned version `1.0.0` transport now present in
the Koral Conversation module:

- `POST /api/v1/koral/web-chat/bootstrap`
- `GET /api/v1/koral/web-chat/history`
- `POST /api/v1/koral/web-chat/messages`
- `POST /api/v1/koral/web-chat/identity/claim`

The server proves the anonymous Web session through a Secure, HttpOnly,
same-site cookie. JavaScript never receives or persists a session token.
Neither `conversationId` nor `externalSessionId` is accepted as bearer proof.
No internal conversation identifier is projected in a response. Snapshot
continuity exists only inside the active cookie-bound browser lifecycle, using
session-bound public message references and opaque cursors.
The history response excludes internal notes, internal events, identity
evidence and gateway references.

Message submission uses one UUID `clientMessageId`. An explicit retry reuses
that UUID; mutations are never automatically retried. Response parsing is
strict and rejects unknown fields, including accidental token-like additions.
Claiming a display name likewise retains one `clientClaimId` across an explicit
retry and can establish only `CLAIMED`; it never verifies or authenticates the
visitor.

`aiAutoReplyAllowed` is server authoritative. The browser never infers it from
conversation status because an active human assignment independently disables
AI. `HUMAN_REQUIRED` and `HUMAN_ACTIVE` must always return `false`.

## Honest capability boundaries

- Polling is bounded and stops for `RESOLVED` and `CLOSED`.
- A 401 clears the server cookie, stops polling and requires an explicit visitor
  action before a replacement conversation is created. Stale messages and
  mutation identifiers are never carried into that new session.
- Message and claim rate-limit cooldowns are independent from history polling;
  a successful read cannot shorten a mutation `Retry-After` window.
- The UI renders request pending state only. It does not simulate streaming or
  typing events.
- The optional name form states explicitly that a declared name is not identity
  verification or login. The browser never upgrades assurance itself.
- Provider, AI Gateway, Tool Gateway, Knowledge Gateway, SQL, Prisma, Redis and
  Firebird are absent from the browser boundary.
- Component tests use an injected client to certify presentation behavior. The
  server's real PostgreSQL/Redis suite owns cookie rotation, expiry, revocation,
  cursor isolation and exactly-once persistence; browser E2E remains a separate
  release gate rather than a simulated transport inside this client.
