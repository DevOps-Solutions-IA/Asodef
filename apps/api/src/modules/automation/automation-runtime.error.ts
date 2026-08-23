export type AutomationFailureCode =
  | "AUTOMATION_DEFINITION_INVALID"
  | "ACTION_NOT_IMPLEMENTED"
  | "ACTION_TIMEOUT"
  | "ACTION_INPUT_INVALID"
  | "EXECUTION_STORE_UNAVAILABLE";

export class AutomationRuntimeError extends Error {
  constructor(
    readonly code: AutomationFailureCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "AutomationRuntimeError";
  }
}
