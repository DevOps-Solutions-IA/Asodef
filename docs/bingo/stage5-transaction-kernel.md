# Bingo Stage 5 transaction kernel

## Transaction boundary

Critical Bingo application commands execute through `BingoTransactionKernel`.
The caller supplies one `CommandContext` containing the resolved actor, request
identifier, idempotency material and clock. Audit and outbox adapters receive
the same Prisma `TransactionClient`; adapters must never open an independent
transaction.

Lifecycle commands use `READ COMMITTED` plus explicit row locks. The invariant
is local to an event/round/execution and the round lock serializes attempts to
start different revisions. Commands that allocate revisions or operate across
an unbounded predicate may opt into `SERIALIZABLE` through the same kernel.
Using `SERIALIZABLE` for every draw/lifecycle operation would add avoidable
serialization failures after the rows already provide the required exclusion.

## Canonical lock order

Locks are always acquired as follows:

1. event;
2. round;
3. execution;
4. assignments sorted by UUID;
5. cards sorted by UUID;
6. candidates sorted by UUID;
7. winners sorted by UUID.

All application services must use `BingoLockManager`; acquiring these aggregate
classes in another order is unsupported. PostgreSQL SQLSTATE `40001` and
`40P01` are retryable only when the command is declared idempotent. Retry count
is bounded (default three), with cryptographically generated exponential
jitter. Business errors, constraints and non-idempotent commands are never
retried.

## Execution lifecycle

Start locks event, round and execution, then verifies locked configuration,
physical snapshots, actors and absence of an incompatible active revision. It
resolves `configurationHash` and `fairnessProtocolVersion` through a required
server-side port and persists them in the same statement that transitions the
execution to `RUNNING`; neither is accepted from a mutable client.

Pause, resume, complete and cancel preserve existing draws/evidence. Completion
delegates its outcome readiness rule to `ExecutionCompletionPolicyPort` inside
the transaction. Dual-control cancellation requires evidence from the frozen,
distinct supervisor and includes the allowlisted approval reference in audit.

## Fairness custody boundary

`CRYPTO_RNG` is permitted. `CRYPTO_RNG_COMMIT_REVEAL` fails closed with
`COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY`, even if its commitment was
published. ASODEF currently has no production seed-custody adapter; a fake KMS
or plaintext seed is explicitly forbidden.

## Atomicity and observability

State, audit and outbox writes occur before the transaction callback returns.
A failure from any port rolls the entire command back. Provider-neutral
observations expose duration, attempt, isolation, outcome and retry SQLSTATE;
they do not log payloads, PII or secrets.
