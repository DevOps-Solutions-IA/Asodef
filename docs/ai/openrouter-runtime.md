# ASODEF AI Gateway — OpenRouter runtime

The OpenRouter integration is an outbound transport behind the canonical
`AiGateway`. Koral resolves an `agentProfileKey` through the source-controlled
binding catalog; callers never submit provider or model identifiers.

Runtime flow:

1. Koral builds the canonical identity, audit, purpose, consent and data
   classification context.
2. `PublishedModelProfileResolver` maps the bounded agent key to a profile.
3. `ModelRegistry` admits only `PUBLISHED`, enabled and policy-approved
   profiles.
4. `OpenRouterProvider` applies classification, structured-output, tool,
   budget, deadline and fallback policies.
5. `OpenRouterClient` sends one explicit model to the pinned HTTPS endpoint.
   OpenRouter's universal fallback router is disabled.
6. The response is parsed and validated locally before Koral can consume it.
7. Redis records daily cost and safe audit metadata without prompts,
   responses, tool arguments or credentials.

## Configuration and secret boundary

The safe default is `AI_RUNTIME_ENABLED=false`. Enabling the runtime requires
`OPENROUTER_API_KEY` to be injected by the runtime secret channel. The key is
not stored in PostgreSQL, model profiles, requests, logs, tests or source
control. CI uses a fake HTTP function and does not contact OpenRouter.

Operational settings are bounded by environment validation:

- `OPENROUTER_BASE_URL` is pinned to `https://openrouter.ai/api/v1`.
- `OPENROUTER_TIMEOUT_MS` bounds each outbound request.
- `OPENROUTER_MAX_ATTEMPTS` bounds declared primary/fallback routes.
- circuit failure threshold and reset duration are bounded.

This change does not configure a production credential, activate the runtime
in production, execute tools, run migrations or deploy anything.
