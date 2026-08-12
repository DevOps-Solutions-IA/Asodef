import { Injectable } from "@nestjs/common";
import * as Firebird from "node-firebird";
import type { Database, Transaction } from "node-firebird";
import type { FirebirdParameter, FirebirdRow } from "../ports/firebird-read-client";
import type { FirebirdQueryDefinition } from "./firebird-query.catalog";

export const NODE_FIREBIRD_POOL_FACTORY = Symbol("NODE_FIREBIRD_POOL_FACTORY");

export interface NodeFirebirdPoolOptions {
  host: string;
  port: number;
  database: string;
  user: "ASODEF_READONLY";
  password: string;
  charset: "UTF8";
  connectionTimeoutMs: number;
  maxConnections: number;
}

export interface ReadOnlyFirebirdTransaction {
  query<T extends FirebirdRow>(
    definition: FirebirdQueryDefinition,
    parameters: readonly FirebirdParameter[],
    signal: AbortSignal,
  ): Promise<readonly T[]>;
  rollback(): Promise<void>;
}

export interface ReadOnlyFirebirdConnection {
  beginReadOnly(): Promise<ReadOnlyFirebirdTransaction>;
  release(): Promise<void>;
}

export interface ReadOnlyFirebirdPool {
  acquire(): Promise<ReadOnlyFirebirdConnection>;
  close(): Promise<void>;
}

export interface NodeFirebirdPoolFactoryPort {
  create(options: NodeFirebirdPoolOptions): ReadOnlyFirebirdPool;
}

class NodeFirebirdTransactionAdapter implements ReadOnlyFirebirdTransaction {
  constructor(private readonly transaction: Transaction) {}

  query<T extends FirebirdRow>(
    definition: FirebirdQueryDefinition,
    parameters: readonly FirebirdParameter[],
    signal: AbortSignal,
  ): Promise<readonly T[]> {
    return this.transaction.queryAsync<T>(definition.sql, [...parameters], { signal });
  }

  rollback(): Promise<void> {
    return this.transaction.rollbackAsync();
  }
}

class NodeFirebirdConnectionAdapter implements ReadOnlyFirebirdConnection {
  constructor(private readonly database: Database) {}

  async beginReadOnly(): Promise<ReadOnlyFirebirdTransaction> {
    const transaction = await this.database.transactionAsync(
      Firebird.ISOLATION_READ_COMMITTED_READ_ONLY,
    );
    return new NodeFirebirdTransactionAdapter(transaction);
  }

  release(): Promise<void> {
    return this.database.detachAsync();
  }
}

@Injectable()
export class NodeFirebirdPoolFactory implements NodeFirebirdPoolFactoryPort {
  create(options: NodeFirebirdPoolOptions): ReadOnlyFirebirdPool {
    const pool = Firebird.pool(options.maxConnections, {
      host: options.host,
      port: options.port,
      database: options.database,
      user: options.user,
      password: options.password,
      encoding: options.charset,
      connectTimeout: options.connectionTimeoutMs,
      lowercase_keys: false,
    });

    return {
      acquire: async () => new NodeFirebirdConnectionAdapter(await pool.getAsync()),
      close: () => pool.destroyAsync(),
    };
  }
}
