import { Injectable } from "@nestjs/common";
import { MasterIdentityMismatchError, MasterUnavailableError } from "../domain/master.errors";
import type { FirebirdRow } from "../ports/firebird-read-client";
import { MASTER_FIREBIRD_EXPECTED_USER } from "../firebird/firebird.config";
import { requireReadyQuery } from "../firebird/firebird-query.catalog";
import { FirebirdReadExecutor } from "../firebird/firebird-read.executor";

export interface MasterConnectionGateResult {
  currentUser: typeof MASTER_FIREBIRD_EXPECTED_USER;
  healthValue: 1;
  contractCount: string;
}

@Injectable()
export class MasterConnectionGateService {
  constructor(private readonly executor: FirebirdReadExecutor) {}

  /** Executes only the three SELECT gates authorized for Phase 1C. */
  async run(): Promise<MasterConnectionGateResult> {
    const currentUserRows = await this.executor.run(requireReadyQuery("currentUser"), []);
    const currentUser = this.readValue(currentUserRows, "CURRENT_USER_NAME");
    if (currentUser !== MASTER_FIREBIRD_EXPECTED_USER) throw new MasterIdentityMismatchError();

    const healthRows = await this.executor.run(requireReadyQuery("health"), []);
    if (this.readValue(healthRows, "HEALTH_VALUE") !== 1) throw new MasterUnavailableError();

    const countRows = await this.executor.run(requireReadyQuery("contractCountGate"), []);
    const contractCount = this.parseContractCount(
      this.readValue(countRows, "CONTRACT_COUNT"),
    );

    return {
      currentUser: MASTER_FIREBIRD_EXPECTED_USER,
      healthValue: 1,
      contractCount,
    };
  }

  private parseContractCount(value: unknown): string {
    if (typeof value === "bigint") {
      if (value < 0n) throw new MasterUnavailableError();
      return value.toString();
    }

    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new MasterUnavailableError();
      return String(value);
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
      return BigInt(value).toString();
    }

    throw new MasterUnavailableError();
  }

  private readValue(rows: readonly FirebirdRow[], key: string): unknown {
    return rows[0]?.[key];
  }
}
