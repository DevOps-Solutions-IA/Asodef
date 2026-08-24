# Koral Web Chat — frontend contract and stacked dependency

This branch implements only the Web Chat browser client and accessible widget.
It does not add a controller, persistence, gateway, provider, model, fake
response, production configuration or deployment.

## Required 1C transport

The vertical slice remains stacked on a server-owned Web transport with these
versioned operations:

- `POST /api/v1/koral/web-chat/bootstrap`
- `GET /api/v1/koral/web-chat/history`
- `POST /api/v1/koral/web-chat/messages`

The server proves the anonymous Web session through a Secure, HttpOnly,
same-site cookie. JavaScript never receives or persists a session token.
Neither `conversationId` nor `externalSessionId` is accepted as bearer proof.
The history response excludes internal notes, internal events, identity
evidence and gateway references.

Message submission uses one UUID `clientMessageId`. An explicit retry reuses
that UUID; mutations are never automatically retried. Response parsing is
strict and rejects unknown fields, including accidental token-like additions.

`aiAutoReplyAllowed` is server authoritative. The browser never infers it from
conversation status because an active human assignment independently disables
AI. `HUMAN_REQUIRED` and `HUMAN_ACTIVE` must always return `false`.

## Honest capability boundaries

- Polling is bounded and stops for `RESOLVED` and `CLOSED`.
- The UI renders request pending state only. It does not simulate streaming or
  typing events.
- Claimed identity remains visibly unavailable until a server-owned
  verification flow exists. The browser never upgrades assurance.
- Provider, AI Gateway, Tool Gateway, Knowledge Gateway, SQL, Prisma, Redis and
  Firebird are absent from the browser boundary.
- E2E must wait for the real server transport. Unit tests use an injected client
  as a component boundary test, not as evidence of an operational backend.
