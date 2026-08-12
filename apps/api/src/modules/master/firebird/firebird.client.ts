import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import {
  MasterDisabledError,
  MasterDomainError,
  MasterIdentityMismatchError,
  MasterTimeoutError,
  MasterUnavailableError,
} from "../domain/master.errors";
import type {
  FirebirdParameter,
  FirebirdQueryOptions,
  FirebirdReadClient,
  FirebirdRow,
} from "../ports/firebird-read-client";
import {
  getMasterFirebirdConnectionConfig,
  getMasterFirebirdRuntimeConfig,
  MASTER_FIREBIRD_EXPECTED_USER,
} from "./firebird.config";
import {
  assertReadOnlyQuery,
  requireReadyQuery,
  type FirebirdQueryDefinition,
} from "./firebird-query.catalog";
import {
  NODE_FIREBIRD_POOL_FACTORY,
  type NodeFirebirdPoolFactoryPort,
  type ReadOnlyFirebirdConnection,
  type ReadOnlyFirebirdPool,
  type ReadOnlyFirebirdTransaction,
} from "./node-firebird-pool.factory";

type CurrentUserRow = FirebirdRow & {
  CURRENT_USER_NAME?: unknown;
};

/**
 * The only production-facing Firebird capability. It accepts static catalog
 * definitions, opens an explicit read-only transaction and always rolls it
 * back before returning the pooled connection.
 */
@Injectable()
export class NodeFirebirdReadClient implements FirebirdReadClient, OnModuleDestroy {
  private pool: ReadOnlyFirebirdPool | undefined;
  private identityValidated = false;
  private identityRejected = false;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(NODE_FIREBIRD_POOL_FACTORY)
    private readonly poolFactory: NodeFirebirdPoolFactoryPort,
  ) {}

  async query<T extends FirebirdRow>(
    definition: FirebirdQueryDefinition,
    parameters: readonly FirebirdParameter[],
    options: FirebirdQueryOptions,
  ): Promise<readonly T[]> {
    if (!getMasterFirebirdRuntimeConfig(this.config).enabled) throw new MasterDisabledError();
    if (this.identityRejected) throw new MasterIdentityMismatchError();
    assertReadOnlyQuery(definition);

    let connection: ReadOnlyFirebirdConnection;
    try {
      connection = await this.getPool().acquire();
    } catch (error) {
      throw this.toSafeError(error, options.signal);
    }

    let transaction: ReadOnlyFirebirdTransaction | undefined;
    let rows: readonly T[] | undefined;
    let failure: MasterDomainError | undefined;

    try {
      transaction = await connection.beginReadOnly();
      if (!this.identityValidated && definition.name !== "currentUser") {
        await this.verifyCurrentUser(transaction, options.signal);
      }
      rows = await transaction.query<T>(definition, parameters, options.signal);
      if (definition.name === "currentUser") this.assertExpectedIdentity(rows);
    } catch (error) {
      failure = this.toSafeError(error, options.signal);
    }

    if (transaction) {
      try {
        await transaction.rollback();
      } catch (error) {
        failure ??= this.toSafeError(error, options.signal);
      }
    }

    try {
      await connection.release();
    } catch (error) {
      failure ??= this.toSafeError(error, options.signal);
    }

    if (failure) {
      if (failure instanceof MasterIdentityMismatchError) {
        this.identityRejected = true;
        await this.closePoolSafely();
      }
      throw failure;
    }

    return rows ?? [];
  }

  async onModuleDestroy(): Promise<void> {
    await this.closePoolSafely();
  }

  private getPool(): ReadOnlyFirebirdPool {
    if (this.pool) return this.pool;
    const runtime = getMasterFirebirdRuntimeConfig(this.config);
    const connection = getMasterFirebirdConnectionConfig(this.config);
    if (connection.user !== MASTER_FIREBIRD_EXPECTED_USER) {
      this.identityRejected = true;
      throw new MasterIdentityMismatchError();
    }
    this.pool = this.poolFactory.create({
      ...connection,
      user: MASTER_FIREBIRD_EXPECTED_USER,
      connectionTimeoutMs: runtime.connectionTimeoutMs,
      maxConnections: runtime.maxConnections,
    });
    return this.pool;
  }

  private async verifyCurrentUser(
    transaction: ReadOnlyFirebirdTransaction,
    signal: AbortSignal,
  ): Promise<void> {
    const definition = requireReadyQuery("currentUser");
    const rows = await transaction.query<CurrentUserRow>(definition, [], signal);
    this.assertExpectedIdentity(rows);
  }

  private assertExpectedIdentity(rows: readonly FirebirdRow[]): void {
    const currentUser = (rows[0] as CurrentUserRow | undefined)?.CURRENT_USER_NAME;
    if (typeof currentUser !== "string" || currentUser.trim() !== MASTER_FIREBIRD_EXPECTED_USER) {
      throw new MasterIdentityMismatchError();
    }
    this.identityValidated = true;
  }

  private toSafeError(error: unknown, signal: AbortSignal): MasterDomainError {
    if (error instanceof MasterDomainError) return error;
    if (signal.aborted) return new MasterTimeoutError();
    return new MasterUnavailableError();
  }

  private async closePoolSafely(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    if (!pool) return;
    try {
      await pool.close();
    } catch {
      // Shutdown must remain fail-closed and must never log native errors,
      // because driver errors can include connection configuration.
    }
  }
}
