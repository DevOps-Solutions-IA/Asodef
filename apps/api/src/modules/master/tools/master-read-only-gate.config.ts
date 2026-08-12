import { z } from "zod";

const integerFromEnvironment = (minimum: number, maximum: number, defaultValue: number) =>
  z.preprocess(
    (value) => value === undefined || value === "" ? defaultValue : value,
    z.coerce.number().int().min(minimum).max(maximum),
  );

const enabledFromEnvironment = z.preprocess(
  (value) => value === true || value === "true",
  z.literal(true),
);

const masterReadOnlyGateEnvironmentSchema = z.object({
  MASTER_FIREBIRD_ENABLED: enabledFromEnvironment,
  MASTER_FIREBIRD_HOST: z.string().trim().min(1),
  MASTER_FIREBIRD_PORT: integerFromEnvironment(1, 65_535, 3051),
  MASTER_FIREBIRD_DATABASE: z.string().trim().min(1),
  MASTER_FIREBIRD_USER: z.literal("ASODEF_READONLY"),
  MASTER_FIREBIRD_PASSWORD: z.string().min(1),
  MASTER_FIREBIRD_CHARSET: z.literal("UTF8").default("UTF8"),
  MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: integerFromEnvironment(100, 60_000, 3000),
  MASTER_FIREBIRD_QUERY_TIMEOUT_MS: integerFromEnvironment(100, 120_000, 5000),
  MASTER_FIREBIRD_MAX_CONNECTIONS: integerFromEnvironment(1, 16, 4),
  MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: integerFromEnvironment(1, 20, 3),
  MASTER_FIREBIRD_CIRCUIT_RESET_MS: integerFromEnvironment(1000, 600_000, 30_000),
});

export type MasterReadOnlyGateEnvironment = z.infer<typeof masterReadOnlyGateEnvironmentSchema>;

export class MasterReadOnlyGateConfigurationError extends Error {
  readonly code = "MASTER_CONFIGURATION_INVALID";

  constructor() {
    super("Master read-only gate configuration is invalid.");
    this.name = "MasterReadOnlyGateConfigurationError";
  }
}

/**
 * Validates only the Master variables used by the standalone diagnostic.
 * Zod details are deliberately discarded because rejected input may contain
 * credentials or connection information.
 */
export function validateMasterReadOnlyGateEnvironment(
  environment: Record<string, unknown>,
): MasterReadOnlyGateEnvironment {
  const result = masterReadOnlyGateEnvironmentSchema.safeParse(environment);
  if (!result.success) throw new MasterReadOnlyGateConfigurationError();
  return result.data;
}
