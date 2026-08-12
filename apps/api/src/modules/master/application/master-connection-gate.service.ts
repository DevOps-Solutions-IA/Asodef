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
    const contractCount = this.readValue(countRows, "CONTRACT_COUNT");
    if (typeof contractCount !== "number" && typeof contractCount !== "bigint" && typeof contractCount !== "string") {
      throw new MasterUnavailableError();
    }

    return {
      currentUser: MASTER_FIREBIRD_EXPECTED_USER,
      healthValue: 1,
      contractCount: String(contractCount),
    };
  }

  private readValue(rows: readonly FirebirdRow[], key: string): unknown {
    return rows[0]?.[key];
  }
}
