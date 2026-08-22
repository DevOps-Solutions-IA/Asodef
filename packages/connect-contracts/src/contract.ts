export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ContractError {
  code: string;
  retryable: boolean;
  description: string;
}

export interface AuditSemantics {
  required: true;
  records: readonly string[];
  piiPolicy: "MINIMIZED_NO_CONTENT";
  correlationRequired: true;
}

export interface IdempotencySemantics {
  required: boolean;
  scope: string;
  duplicateBehavior: string;
  retention: string;
}

/** Portable schema fragments. They are intentionally data, not executable validators. */
export interface ContractSchema {
  readonly $id: string;
  readonly type: "object";
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, JsonObject>>;
  readonly additionalProperties: boolean;
}

export interface PublicContract<Input, Output> {
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly inputSchema: ContractSchema;
  readonly outputSchema: ContractSchema;
  readonly errors: readonly ContractError[];
  readonly permissions: readonly string[];
  readonly audit: AuditSemantics;
  readonly idempotency: IdempotencySemantics;
  /** Type witnesses make the descriptor useful to TypeScript clients without
   * serializing functions or runtime implementation into the contract. */
  readonly _input?: Input;
  readonly _output?: Output;
}

export const MINIMIZED_AUDIT: AuditSemantics = {
  required: true,
  records: [
    "actor/service identity",
    "decision",
    "result",
    "reason code",
    "correlationId",
  ],
  piiPolicy: "MINIMIZED_NO_CONTENT",
  correlationRequired: true,
};
