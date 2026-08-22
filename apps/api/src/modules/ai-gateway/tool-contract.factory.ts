import type { DataClassification } from "./data-classification";
import type { GovernedToolContract, MinimumIdentityLevel } from "./tool-gateway.types";
import type { ConfigurationStatus } from "./ai-contracts";

const STANDARD_ERRORS = [
  { code: "INVALID_INPUT", description: "Input does not satisfy the published schema.", retryable: false },
  { code: "FORBIDDEN", description: "The authenticated actor is not authorized for this operation.", retryable: false },
  { code: "NOT_FOUND", description: "The requested business resource was not found or is outside scope.", retryable: false },
  { code: "CONFLICT", description: "The requested mutation conflicts with current state or version.", retryable: false },
  { code: "RATE_LIMITED", description: "The governed operation rate limit was reached.", retryable: true },
] as const;

interface GovernedToolDefinition {
  name: string;
  description: string;
  permission: string;
  applicationServiceMethod: string;
  mutation: boolean;
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema: Readonly<Record<string, unknown>>;
  dataClassification: DataClassification;
  minimumIdentityLevel?: MinimumIdentityLevel;
  confirmationRequired?: boolean;
  redactFields?: readonly string[];
  status?: ConfigurationStatus;
}

export function defineGovernedTool(definition: GovernedToolDefinition): GovernedToolContract {
  const idempotency: GovernedToolContract["idempotency"] = definition.mutation
    ? {
        required: true,
        keyField: "idempotencyKey",
        scope: "ACTOR_OPERATION",
        replay: "RETURN_ORIGINAL_RESPONSE",
      }
    : { required: false, semantics: "READ_ONLY" };
  const contract: GovernedToolContract = {
    name: definition.name,
    version: "v1",
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    errors: STANDARD_ERRORS,
    permission: definition.permission,
    minimumIdentityLevel:
      definition.minimumIdentityLevel ?? (definition.mutation ? "MFA_VERIFIED" : "AUTHENTICATED"),
    confirmationRequired: definition.confirmationRequired ?? false,
    rateLimit: { policyKey: `ai:tool:${definition.name}`, scope: "ACTOR_TOOL", failClosed: true },
    idempotency,
    timeout: { milliseconds: definition.mutation ? 10_000 : 5_000, maxAttempts: 1 },
    audit: {
      event: `ai.tool.${definition.name}`,
      recordActor: true,
      recordTarget: true,
      recordResult: true,
      redactFields: definition.redactFields ?? [],
    },
    dataClassification: definition.dataClassification,
    status: definition.status ?? "PUBLISHED",
    execution: {
      applicationServiceMethod: definition.applicationServiceMethod,
      directDataAccess: false,
      ownershipAndTenantScope: "APPLICATION_SERVICE_ENFORCED",
    },
  };
  return Object.freeze(contract);
}
