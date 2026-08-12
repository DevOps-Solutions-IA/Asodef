import type { FirebirdQueryDefinition } from "../firebird/firebird-query.catalog";

export const FIREBIRD_READ_CLIENT = Symbol("FIREBIRD_READ_CLIENT");

export type FirebirdParameter = string | number | bigint | boolean | Date | null;
export type FirebirdRow = Readonly<Record<string, unknown>>;

export interface FirebirdQueryOptions {
  signal: AbortSignal;
}

/**
 * Deliberately read-only. The port does not expose execute, transactions that
 * can write, DDL, procedures, or caller-supplied SQL strings.
 */
export interface FirebirdReadClient {
  query<T extends FirebirdRow>(
    definition: FirebirdQueryDefinition,
    parameters: readonly FirebirdParameter[],
    options: FirebirdQueryOptions,
  ): Promise<readonly T[]>;
}
