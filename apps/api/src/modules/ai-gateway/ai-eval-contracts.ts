import type { ConfigurationStatus, JsonSchema } from "./ai-contracts";

export const AI_EVAL_DIMENSIONS = [
  "GOLDEN_CONVERSATION",
  "KNOWLEDGE_ACCURACY",
  "TOOL_SELECTION",
  "TOOL_ARGUMENTS",
  "PII_LEAKAGE",
  "POLICY",
  "JAILBREAK",
  "HALLUCINATION",
  "HANDOFF",
] as const;

export type AiEvalDimension = (typeof AI_EVAL_DIMENSIONS)[number];

export interface AiEvalCase {
  id: string;
  version: number;
  name: string;
  dimension: AiEvalDimension;
  status: ConfigurationStatus;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  expectedToolNames?: readonly string[];
  forbiddenPatterns?: readonly string[];
  minimumScore: number;
  permission: "settings.manage";
  audit: {
    event: "ai.eval.case.executed";
    recordActor: true;
    recordResult: true;
    retainPrompt: false;
  };
  idempotency: { required: true; scope: "EVAL_SUITE_CASE_VERSION" };
}

export interface AiEvalResult {
  caseId: string;
  caseVersion: number;
  dimension: AiEvalDimension;
  passed: boolean;
  score: number;
  findings: readonly {
    code: string;
    severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    evidenceDigest?: string;
  }[];
  modelProfileId: string;
  modelProfileVersion: number;
  correlationId: string;
}

export interface AiEvalSuite {
  id: string;
  version: number;
  status: ConfigurationStatus;
  caseIds: readonly string[];
  blockingDimensions: readonly AiEvalDimension[];
  requiredPassRate: number;
}

export class AiEvalPolicy {
  assertPublishable(suite: AiEvalSuite, results: readonly AiEvalResult[]): void {
    if (suite.status !== "PUBLISHED") throw new Error("EVAL_SUITE_NOT_PUBLISHED");
    if (results.length === 0) throw new Error("EVAL_RESULTS_REQUIRED");
    const passRate = results.filter((result) => result.passed).length / results.length;
    if (passRate < suite.requiredPassRate) throw new Error("EVAL_PASS_RATE_NOT_MET");
    const blockingFailure = results.some(
      (result) => !result.passed && suite.blockingDimensions.includes(result.dimension),
    );
    if (blockingFailure) throw new Error("EVAL_BLOCKING_DIMENSION_FAILED");
  }
}
