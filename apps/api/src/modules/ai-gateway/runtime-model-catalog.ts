import type { ModelProfile } from "./model-registry";
import type { PricingEstimator } from "./openrouter-provider";

/** Source-controlled allowlist. These are explicit model slugs, never the
 * OpenRouter auto router or a mutable "latest" alias. A prompt/user cannot
 * add a route; changing the catalog requires ordinary review and CI. */
export const APPROVED_MODEL_PROFILES: readonly ModelProfile[] = [
  {
    id: "koral-crm-assistant",
    name: "Koral CRM assistant",
    primaryModel: "openai/gpt-4.1-mini",
    fallbackModels: ["google/gemini-2.5-flash"],
    allowedProviders: ["openrouter"],
    purpose: "crm-assistance",
    maxInputTokens: 16_000,
    maxOutputTokens: 2_000,
    budgetPolicy: {
      currency: "USD",
      maxCostMicrosPerRequest: 2_000_000,
      maxCostMicrosPerDay: 20_000_000,
      failClosedWhenPricingUnknown: true,
    },
    toolCallingAllowed: true,
    structuredOutputRequired: true,
    dataClassificationPolicy: {
      allowed: ["PUBLIC", "INTERNAL", "PERSONAL"],
      denied: ["SENSITIVE", "HIGHLY_SENSITIVE"],
      requirePurpose: true,
      requireConsentFor: ["PERSONAL"],
      maximumExternalClassification: "PERSONAL",
    },
    enabled: true,
    policyApproved: true,
    status: "PUBLISHED",
    version: 1,
  },
];

export const APPROVED_AGENT_MODEL_BINDINGS: readonly {
  agentProfileKey: string;
  modelProfileId: string;
}[] = [
  {
    agentProfileKey: "koral.crm-assistant",
    modelProfileId: "koral-crm-assistant",
  },
];

/** Conservative preflight estimates are intentionally ceilings rather than
 * volatile vendor price claims. Provider-reported cost replaces the estimate
 * after a successful response. Unknown models fail closed. */
const MODEL_COST_CEILING_MICROS_PER_TOKEN = new Map<string, number>([
  ["openai/gpt-4.1-mini", 100],
  ["google/gemini-2.5-flash", 100],
]);

export class ApprovedModelPricingEstimator implements PricingEstimator {
  estimateCostMicros(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number | null {
    const ceiling = MODEL_COST_CEILING_MICROS_PER_TOKEN.get(model);
    if (ceiling === undefined) return null;
    if (
      !Number.isSafeInteger(inputTokens) ||
      !Number.isSafeInteger(outputTokens) ||
      inputTokens < 0 ||
      outputTokens < 0
    ) {
      return null;
    }
    return Math.min(
      Number.MAX_SAFE_INTEGER,
      (inputTokens + outputTokens) * ceiling,
    );
  }
}
