export type CommunicationsRuntimeErrorCode =
  | "COMMUNICATION_INPUT_INVALID"
  | "COMMUNICATION_PERMISSION_DENIED"
  | "COMMUNICATION_DEADLINE_EXCEEDED"
  | "IDEMPOTENCY_CONFLICT"
  | "TEMPLATE_NOT_PUBLISHED"
  | "TEMPLATE_VARIABLES_INVALID"
  | "TEMPLATE_UNSAFE"
  | "TRANSPORT_NOT_AVAILABLE"
  | "CONSENT_REQUIRED"
  | "STEP_UP_REQUIRED"
  | "RATE_LIMITED"
  | "RATE_LIMIT_DEPENDENCY_UNAVAILABLE"
  | "DELIVERY_STORE_UNAVAILABLE";

export class CommunicationsRuntimeError extends Error {
  constructor(
    readonly code: CommunicationsRuntimeErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "CommunicationsRuntimeError";
  }
}
