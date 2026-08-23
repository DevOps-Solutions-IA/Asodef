import type { GovernedToolContract, ToolStatus } from "./tool-gateway.types";

export class ToolRegistry {
  private readonly contracts: ReadonlyMap<string, GovernedToolContract>;

  constructor(contracts: readonly GovernedToolContract[]) {
    const byVersion = new Map<string, GovernedToolContract>();
    for (const contract of contracts) {
      const key = this.key(contract.name, contract.version);
      if (byVersion.has(key)) throw new Error(`DUPLICATE_TOOL_CONTRACT:${key}`);
      byVersion.set(key, contract);
    }
    this.contracts = byVersion;
  }

  list(status?: ToolStatus): readonly GovernedToolContract[] {
    const contracts = [...this.contracts.values()];
    return status
      ? contracts.filter((contract) => contract.status === status)
      : contracts;
  }

  getPublished(name: string, version: `v${number}`): GovernedToolContract {
    const contract = this.contracts.get(this.key(name, version));
    if (!contract) throw new Error(`TOOL_NOT_FOUND:${name}@${version}`);
    if (contract.status !== "PUBLISHED")
      throw new Error(
        `TOOL_NOT_PUBLISHED:${name}@${version}:${contract.status}`,
      );
    return contract;
  }

  private key(name: string, version: `v${number}`): string {
    return `${name}@${version}`;
  }
}
