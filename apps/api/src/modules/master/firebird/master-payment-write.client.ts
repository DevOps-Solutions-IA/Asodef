import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Firebird, { type Database, type Options, type Pool, type Transaction } from "node-firebird";
import type { EnvConfig } from "../../../config/env.validation";

export type MasterProcedureRow = Record<string, unknown>;

export class MasterPaymentWriteUnavailableError extends Error {
  constructor(message = "Master payment writer is unavailable") {
    super(message);
    this.name = "MasterPaymentWriteUnavailableError";
  }
}

/**
 * Narrow write boundary for the already-certified ASODEF/BOLD stored
 * procedures. It never accepts SQL from callers and never grants table-level
 * mutation authority to the application. The runtime identity must be the
 * dedicated ASODEF_BOLD Firebird user; SYSDBA and ASODEF_READONLY are rejected.
 *
 * Writer credentials deliberately live in separate runtime environment
 * variables from the read adapter. Until MASTER_FIREBIRD_WRITE_ENABLED=true
 * and a valid ASODEF_BOLD credential are provisioned, every method fails
 * closed before opening a socket.
 */
@Injectable()
export class MasterPaymentWriteClient implements OnApplicationShutdown {
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  isEnabled(): boolean {
    return process.env.MASTER_FIREBIRD_WRITE_ENABLED === "true";
  }

  async health(): Promise<{ enabled: boolean; currentUser: string | null }> {
    if (!this.isEnabled()) return { enabled: false, currentUser: null };
    const row = await this.executeOne("SELECT CURRENT_USER AS CURRENT_USER_NAME FROM RDB$DATABASE", []);
    return { enabled: true, currentUser: String(row.CURRENT_USER_NAME ?? "") || null };
  }

  createQuote(quoteId: string, contractId: string, boldReference: string): Promise<MasterProcedureRow> {
    return this.executeOne("SELECT * FROM P_ASODEF_BOLD_QUOTE_CREATE(?, ?, ?)", [quoteId, contractId, boldReference]);
  }

  verifyQuote(input: {
    quoteId: string;
    transactionId: string;
    orderId: string;
    amount: number;
  }): Promise<MasterProcedureRow> {
    return this.executeOne("SELECT * FROM P_ASODEF_BOLD_QUOTE_VERIFY(?, ?, ?, ?, ?)", [
      input.quoteId,
      input.transactionId,
      input.orderId,
      input.amount,
      "APPROVED",
    ]);
  }

  prepare(quoteId: string): Promise<MasterProcedureRow> {
    return this.executeOne("SELECT * FROM P_ASODEF_BOLD_MASTER_PREPARE(?)", [quoteId]);
  }

  commitMaster(quoteId: string): Promise<MasterProcedureRow> {
    return this.executeOne("SELECT * FROM P_ASODEF_BOLD_MASTER_COMMIT(?)", [quoteId]);
  }

  reconcile(quoteId: string): Promise<MasterProcedureRow> {
    return this.executeOne("SELECT * FROM P_ASODEF_BOLD_RECONCILE(?)", [quoteId]);
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.destroyAsync();
    } finally {
      this.pool = null;
    }
  }

  private runtimeOptions(): Options {
    if (!this.isEnabled()) throw new MasterPaymentWriteUnavailableError("MASTER_WRITE_DISABLED");
    const user = process.env.MASTER_FIREBIRD_WRITE_USER?.trim() ?? "";
    const password = process.env.MASTER_FIREBIRD_WRITE_PASSWORD ?? "";
    if (user !== "ASODEF_BOLD" || !password || /[\r\n]/.test(password)) {
      throw new MasterPaymentWriteUnavailableError("MASTER_WRITE_IDENTITY_INVALID");
    }
    if (!this.config.get("MASTER_FIREBIRD_ENABLED", { infer: true })) {
      throw new MasterPaymentWriteUnavailableError("MASTER_READ_GATE_DISABLED");
    }
    return {
      host: this.config.get("MASTER_FIREBIRD_HOST", { infer: true }),
      port: this.config.get("MASTER_FIREBIRD_PORT", { infer: true }),
      database: this.config.get("MASTER_FIREBIRD_DATABASE", { infer: true }),
      user,
      password,
      lowercase_keys: false,
      role: undefined,
      pageSize: 4096,
      charset: this.config.get("MASTER_FIREBIRD_CHARSET", { infer: true }),
      retryConnectionInterval: 0,
    };
  }

  private getPool(): Pool {
    if (!this.pool) this.pool = Firebird.pool(1, this.runtimeOptions());
    return this.pool;
  }

  private async executeOne(sql: string, parameters: readonly unknown[]): Promise<MasterProcedureRow> {
    const pool = this.getPool();
    let database: Database | null = null;
    let transaction: Transaction | null = null;
    try {
      database = await pool.getAsync();
      transaction = await database.transactionAsync(Firebird.ISOLATION_READ_COMMITTED);
      const identityRows = (await transaction.queryAsync(
        "SELECT CURRENT_USER AS CURRENT_USER_NAME FROM RDB$DATABASE",
        [],
      )) as MasterProcedureRow[];
      if (String(identityRows[0]?.CURRENT_USER_NAME ?? "").trim() !== "ASODEF_BOLD") {
        throw new MasterPaymentWriteUnavailableError("MASTER_WRITE_IDENTITY_MISMATCH");
      }
      const rows = (await transaction.queryAsync(sql, [...parameters])) as MasterProcedureRow[];
      if (rows.length !== 1) throw new MasterPaymentWriteUnavailableError("MASTER_PROCEDURE_RESPONSE_INVALID");
      await transaction.commitAsync();
      transaction = null;
      return rows[0]!;
    } catch (error) {
      if (transaction) {
        try { await transaction.rollbackAsync(); } catch { /* best effort rollback */ }
      }
      if (error instanceof MasterPaymentWriteUnavailableError) throw error;
      throw new MasterPaymentWriteUnavailableError("MASTER_PROCEDURE_EXECUTION_FAILED");
    } finally {
      if (database) {
        try { database.detach(); } catch { /* pool handle cleanup */ }
      }
    }
  }
}
