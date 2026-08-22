import type { ConfigurationStatus } from "./ai-contracts";
import type { DataClassificationPolicyContract } from "./data-classification";

export interface BudgetPolicy {
  currency: "USD";
  maxCostMicrosPerRequest: number;
  maxCostMicrosPerDay: number;
  failClosedWhenPricingUnknown: boolean;
}

export interface ModelProfile {
  id: string;
  name: string;
  primaryModel: string;
  fallbackModels: readonly string[];
  allowedProviders: readonly string[];
  purpose: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  budgetPolicy: BudgetPolicy;
  toolCallingAllowed: boolean;
  structuredOutputRequired: boolean;
  dataClassificationPolicy: DataClassificationPolicyContract;
  status: ConfigurationStatus;
  version: number;
}

export class ModelRegistry {
  private readonly profiles: readonly ModelProfile[];

  constructor(profiles: readonly ModelProfile[]) {
    const versions = new Set<string>();
    for (const profile of profiles) {
      const key = `${profile.id}@${profile.version}`;
      if (versions.has(key)) throw new Error(`DUPLICATE_MODEL_PROFILE:${key}`);
      if (profile.version < 1 || profile.maxInputTokens < 1 || profile.maxOutputTokens < 1) {
        throw new Error(`INVALID_MODEL_PROFILE:${key}`);
      }
      if (
        !profile.primaryModel.trim() ||
        profile.allowedProviders.length === 0 ||
        profile.budgetPolicy.maxCostMicrosPerRequest < 0 ||
        profile.budgetPolicy.maxCostMicrosPerDay < profile.budgetPolicy.maxCostMicrosPerRequest
      ) {
        throw new Error(`INVALID_MODEL_PROFILE:${key}`);
      }
      versions.add(key);
    }
    this.profiles = [...profiles];
  }

  list(): readonly ModelProfile[] {
    return this.profiles;
  }

  getPublished(id: string): ModelProfile {
    const matches = this.profiles
      .filter((profile) => profile.id === id && profile.status === "PUBLISHED")
      .sort((left, right) => right.version - left.version);
    if (matches.length === 0) throw new Error(`MODEL_PROFILE_NOT_PUBLISHED:${id}`);
    return matches[0]!;
  }
}

const MODEL_PROFILE_TRANSITIONS: Readonly<Record<ConfigurationStatus, readonly ConfigurationStatus[]>> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["RETIRED", "ROLLED_BACK"],
  RETIRED: [],
  ROLLED_BACK: [],
};

export class ModelProfileLifecyclePolicy {
  assertTransition(current: ConfigurationStatus, next: ConfigurationStatus): void {
    if (!MODEL_PROFILE_TRANSITIONS[current].includes(next)) {
      throw new Error(`INVALID_MODEL_PROFILE_TRANSITION:${current}:${next}`);
    }
  }
}
