import { MINIMIZED_AUDIT } from "./shared";
import type { PublicContract } from "./shared";

export const PLAN_LIFECYCLE = ["DRAFT", "REVIEW", "PUBLISHED", "RETIRED"] as const;
export type PlanLifecycle = (typeof PLAN_LIFECYCLE)[number];

export const PLAN_BILLING_PERIODS = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ONE_TIME"] as const;
export type PlanBillingPeriod = (typeof PLAN_BILLING_PERIODS)[number];
export type PlanAudience = "PUBLIC" | "KORAL" | "CRM" | "CONTRACTS";

export interface PlanCatalogItem {
  code: string;
  name: string;
  description: string | null;
}

export interface PublishedPlanVersion {
  planId: string;
  planVersionId: string;
  code: string;
  version: number;
  name: string;
  description: string;
  features: readonly PlanCatalogItem[];
  benefits: readonly PlanCatalogItem[];
  eligibility: string | null;
  pricing: { amountMinor: number; currency: string; billingPeriod: PlanBillingPeriod };
  commercialText: string | null;
  terms: string | null;
  recommended: boolean;
  displayOrder: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string;
}

export interface AdminPlanVersion extends Omit<PublishedPlanVersion, "publishedAt" | "pricing" | "features" | "benefits"> {
  internalName: string;
  status: PlanLifecycle | "LEGACY_UNMAPPED";
  legacyStatus: string | null;
  pricing: { amountMinor: number; currency: string | null; billingPeriod: string };
  features: readonly PlanCatalogItem[] | null;
  benefits: readonly PlanCatalogItem[] | null;
  revision: number;
  visibility: { public: boolean; koral: boolean; crm: boolean; contracts: boolean };
  reviewedAt: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
}

export interface AdminPlan {
  id: string;
  code: string | null;
  name: string;
  currentVersionId: string | null;
  createdAt: string;
  versions: readonly AdminPlanVersion[];
}

export interface PublishedPlansReadInput {
  audience: PlanAudience;
  code?: string;
  effectiveAt?: string;
}

export interface PublishedPlansReadOutput {
  plans: readonly PublishedPlanVersion[];
}

export interface PlanLifecycleCommandInput {
  planId: string;
  planVersionId: string;
  expectedRevision: number;
  action: "SUBMIT_REVIEW" | "PUBLISH" | "RETIRE";
  reason: string;
  idempotencyKey: string;
}

export interface PlanLifecycleCommandOutput {
  planId: string;
  planVersionId: string;
  status: PlanLifecycle;
  revision: number;
  applied: boolean;
}

const PLAN_ERRORS = [
  { code: "PLAN_NOT_FOUND", retryable: false, description: "El plan o la versión no existe." },
  { code: "INVALID_LIFECYCLE", retryable: false, description: "La transición solicitada no es válida." },
  { code: "REVISION_CONFLICT", retryable: true, description: "La versión cambió desde la última lectura." },
  { code: "PLAN_NOT_EFFECTIVE", retryable: false, description: "No hay una versión publicada y vigente para la audiencia." },
] as const;

export const PUBLISHED_PLANS_READ_CONTRACT: PublicContract<PublishedPlansReadInput, PublishedPlansReadOutput> = {
  name: "plans.published.read",
  version: "1.0.0",
  inputSchema: {
    $id: "asodef.connect.plans.published.read.input.v1",
    type: "object",
    required: ["audience"],
    properties: {
      audience: { type: "string", enum: ["PUBLIC", "KORAL", "CRM", "CONTRACTS"] },
      code: { type: "string" },
      effectiveAt: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "asodef.connect.plans.published.read.output.v1",
    type: "object",
    required: ["plans"],
    properties: { plans: { type: "array" } },
    additionalProperties: false,
  },
  errors: PLAN_ERRORS,
  permissions: ["public (PUBLIC)", "koral.plans.read (KORAL)", "plans.read (CRM/CONTRACTS)"],
  audit: MINIMIZED_AUDIT,
  idempotency: { required: false, scope: "read-only", duplicateBehavior: "Equivalent reads have no side effects.", retention: "none" },
};

export const PLAN_LIFECYCLE_COMMAND_CONTRACT: PublicContract<PlanLifecycleCommandInput, PlanLifecycleCommandOutput> = {
  name: "plans.lifecycle.command",
  version: "1.0.0",
  inputSchema: {
    $id: "asodef.connect.plans.lifecycle.command.input.v1",
    type: "object",
    required: ["planId", "planVersionId", "expectedRevision", "action", "reason", "idempotencyKey"],
    properties: {
      planId: { type: "string", format: "uuid" },
      planVersionId: { type: "string", format: "uuid" },
      expectedRevision: { type: "integer", minimum: 1 },
      action: { type: "string", enum: ["SUBMIT_REVIEW", "PUBLISH", "RETIRE"] },
      reason: { type: "string", minLength: 1 },
      idempotencyKey: { type: "string", minLength: 16, maxLength: 100 },
    },
    additionalProperties: false,
  },
  outputSchema: {
    $id: "asodef.connect.plans.lifecycle.command.output.v1",
    type: "object",
    required: ["planId", "planVersionId", "status", "revision", "applied"],
    properties: {
      planId: { type: "string", format: "uuid" },
      planVersionId: { type: "string", format: "uuid" },
      status: { type: "string", enum: [...PLAN_LIFECYCLE] },
      revision: { type: "integer" },
      applied: { type: "boolean" },
    },
    additionalProperties: false,
  },
  errors: PLAN_ERRORS,
  permissions: ["plans.manage (submit review)", "plans.publish + step-up (publish/retire)"],
  audit: MINIMIZED_AUDIT,
  idempotency: { required: true, scope: "actor + operation + Idempotency-Key", duplicateBehavior: "Replay prior result; reject payload drift.", retention: "database policy" },
};
