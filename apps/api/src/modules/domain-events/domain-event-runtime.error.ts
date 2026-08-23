export type DomainEventRuntimeErrorCode =
  | "EVENT_SCHEMA_INVALID"
  | "EVENT_IDEMPOTENCY_CONFLICT"
  | "EVENT_STORE_UNAVAILABLE";

export class DomainEventRuntimeError extends Error {
  constructor(
    readonly code: DomainEventRuntimeErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "DomainEventRuntimeError";
  }
}
