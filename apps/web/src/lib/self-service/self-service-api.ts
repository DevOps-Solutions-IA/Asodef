import { ApiError, classifyStatus, type ApiErrorEnvelope } from "../api-error";
import { apiClient } from "../api-client";
import type {
  AccessStartResult,
  AccessVerifyResult,
  AffiliateAccessInput,
  BeneficiaryDraftInput,
  ChallengeRequestInput,
  ChallengeRequestResult,
  ChallengeResendInput,
  ChallengeVerifyInput,
  CompanyAccessInput,
  ProviderCollection,
  ProviderPayload,
  ProviderResult,
  ResourceResult,
  SelfServiceScope,
  SessionResult,
} from "./types";

const API_ORIGIN = import.meta.env.VITE_API_URL ?? "";
const API_PREFIX = "/api/v1";
const base = (scope: SelfServiceScope) => `/self-service/${scope}`;

function normalizeResource<T>(result: ProviderResult<T>): ResourceResult<T> {
  if (result.status === "VERIFIED") {
    const empty = Array.isArray(result.data) && result.data.length === 0;
    return empty ? { status: "empty", message: "Aún no hay información para mostrar." } : { status: "success", data: result.data };
  }
  return {
    status: result.status === "NOT_CONFIGURED" ? "not_configured" : "unavailable",
    message: result.error.message,
  };
}

async function getResource<T>(path: string, signal?: AbortSignal): Promise<ResourceResult<T>> {
  try { return normalizeResource(await apiClient.get<ProviderResult<T>>(path, { signal, skipAuthRefresh: true })); }
  catch (error) {
    if (error instanceof ApiError && error.kind === "unauthorized") return { status: "expired", message: error.message };
    if (error instanceof ApiError && error.kind === "forbidden") return { status: "unauthorized", message: error.message };
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { status: "unavailable", message: error instanceof ApiError ? error.message : undefined };
  }
}

const CSRF_STORAGE = {
  affiliate: "asodef:ss:affiliate:csrf",
  company: "asodef:ss:company:csrf",
} as const;

function scopeFromPath(path: string): SelfServiceScope {
  return path.includes("/company/") ? "company" : "affiliate";
}

function currentCsrf(path: string, fallback: string): string {
  return sessionStorage.getItem(CSRF_STORAGE[scopeFromPath(path)]) ?? fallback;
}

function captureRotatedCsrf(path: string, response: Response): void {
  const next = response.headers.get("x-csrf-token");
  if (next) sessionStorage.setItem(CSRF_STORAGE[scopeFromPath(path)], next);
}

function mutationHeaders(path: string, csrfToken: string, idempotencyKey: string) {
  return { "X-CSRF-Token": currentCsrf(path, csrfToken), "Idempotency-Key": idempotencyKey };
}

async function mutateResource<T>(method: "POST" | "PATCH", path: string, csrfToken: string, idempotencyKey: string, payload?: ProviderPayload): Promise<ResourceResult<T>> {
  const body = payload ? { payload } : undefined;
  const options = { headers: mutationHeaders(path, csrfToken, idempotencyKey), skipAuthRefresh: true, onResponse: (response: Response) => captureRotatedCsrf(path, response) };
  const result = method === "POST"
    ? await apiClient.post<ProviderResult<T>>(path, body, options)
    : await apiClient.patch<ProviderResult<T>>(path, body, options);
  return normalizeResource(result);
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `ss_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function uploadMultipart<T>(path: string, form: FormData, csrfToken: string, idempotencyKey: string): Promise<ResourceResult<T>> {
  const requestId = createRequestId();
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Request-Id": requestId,
        "X-CSRF-Token": currentCsrf(path, csrfToken),
        "Idempotency-Key": idempotencyKey,
      },
      body: form,
    });
  } catch (cause) {
    throw new ApiError({ kind: "network", status: null, envelope: null, requestId, cause });
  }
  captureRotatedCsrf(path, response);
  const text = await response.text();
  let envelope: ApiErrorEnvelope | null = null;
  if (text) {
    try { envelope = JSON.parse(text) as ApiErrorEnvelope; } catch { envelope = null; }
  }
  if (!response.ok) {
    throw new ApiError({ kind: classifyStatus(response.status), status: response.status, envelope, requestId: envelope?.requestId ?? requestId });
  }
  return normalizeResource(envelope as unknown as ProviderResult<T>);
}

export const selfServiceApi = {
  startAffiliateAccess: (input: AffiliateAccessInput) => apiClient.post<AccessStartResult>(`${base("affiliate")}/access/start`, input, { skipAuthRefresh: true }),
  requestAffiliateChallenge: (input: ChallengeRequestInput) => apiClient.post<ChallengeRequestResult>(`${base("affiliate")}/access/request-code`, input, { skipAuthRefresh: true }),
  resendAffiliateChallenge: (input: ChallengeResendInput) => apiClient.post<ChallengeRequestResult>(`${base("affiliate")}/access/resend`, input, { skipAuthRefresh: true }),
  verifyAffiliateAccess: (input: ChallengeVerifyInput) => apiClient.post<AccessVerifyResult>(`${base("affiliate")}/access/verify`, input, { skipAuthRefresh: true }),
  getAffiliateSession: (signal?: AbortSignal) => apiClient.get<SessionResult>(`${base("affiliate")}/session`, { signal, skipAuthRefresh: true }),
  endAffiliateSession: (csrfToken: string) => {
    const path = `${base("affiliate")}/session`;
    return apiClient.delete<{ status: "VERIFIED" }>(path, { headers: { "X-CSRF-Token": currentCsrf(path, csrfToken) }, skipAuthRefresh: true });
  },
  startCompanyAccess: (input: CompanyAccessInput) => apiClient.post<AccessStartResult>(`${base("company")}/access/start`, input, { skipAuthRefresh: true }),
  requestCompanyChallenge: (input: ChallengeRequestInput) => apiClient.post<ChallengeRequestResult>(`${base("company")}/access/request-code`, input, { skipAuthRefresh: true }),
  resendCompanyChallenge: (input: ChallengeResendInput) => apiClient.post<ChallengeRequestResult>(`${base("company")}/access/resend`, input, { skipAuthRefresh: true }),
  verifyCompanyAccess: (input: ChallengeVerifyInput) => apiClient.post<AccessVerifyResult>(`${base("company")}/access/verify`, input, { skipAuthRefresh: true }),
  getCompanySession: (signal?: AbortSignal) => apiClient.get<SessionResult>(`${base("company")}/session`, { signal, skipAuthRefresh: true }),
  endCompanySession: (csrfToken: string) => {
    const path = `${base("company")}/session`;
    return apiClient.delete<{ status: "VERIFIED" }>(path, { headers: { "X-CSRF-Token": currentCsrf(path, csrfToken) }, skipAuthRefresh: true });
  },

  getSummary: (scope: SelfServiceScope, signal?: AbortSignal) => getResource<ProviderPayload>(`${base(scope)}/summary`, signal),
  getAffiliateAffiliation: (signal?: AbortSignal) => getResource<ProviderPayload>(`${base("affiliate")}/summary`, signal),
  getAffiliateBeneficiaries: (signal?: AbortSignal) => getResource<ProviderCollection>(`${base("affiliate")}/beneficiaries`, signal),
  getAffiliateStatement: (signal?: AbortSignal) => getResource<ProviderPayload>(`${base("affiliate")}/account-statement`, signal),
  getRecords: (scope: SelfServiceScope, resource: "benefits" | "contracts" | "obligations" | "payments" | "receipts" | "documents" | "requests" | "reports", signal?: AbortSignal) => getResource<ProviderCollection>(`${base(scope)}/${resource}`, signal),

  getBeneficiaryRules: (signal?: AbortSignal) => getResource<ProviderPayload>(`${base("affiliate")}/beneficiary-rules`, signal),
  getBeneficiaryChangeRequests: (signal?: AbortSignal) => getResource<ProviderCollection>(`${base("affiliate")}/beneficiary-change-requests`, signal),
  getBeneficiaryChangeRequest: (requestId: string, signal?: AbortSignal) => getResource<ProviderPayload>(`${base("affiliate")}/beneficiary-change-requests/${encodeURIComponent(requestId)}`, signal),
  createBeneficiaryDraft: (input: BeneficiaryDraftInput, csrfToken: string, idempotencyKey: string) => mutateResource<ProviderPayload>("POST", `${base("affiliate")}/beneficiary-change-requests`, csrfToken, idempotencyKey, { ...input }),
  updateBeneficiaryDraft: (requestId: string, input: BeneficiaryDraftInput, csrfToken: string, idempotencyKey: string) => mutateResource<ProviderPayload>("PATCH", `${base("affiliate")}/beneficiary-change-requests/${encodeURIComponent(requestId)}`, csrfToken, idempotencyKey, { ...input }),
  uploadBeneficiaryDocument: (requestId: string, file: File, documentType: string, csrfToken: string, idempotencyKey: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);
    return uploadMultipart<ProviderPayload>(`${base("affiliate")}/beneficiary-change-requests/${encodeURIComponent(requestId)}/documents`, form, csrfToken, idempotencyKey);
  },
  submitBeneficiaryRequest: (requestId: string, csrfToken: string, idempotencyKey: string) => mutateResource<ProviderPayload>("POST", `${base("affiliate")}/beneficiary-change-requests/${encodeURIComponent(requestId)}/submit`, csrfToken, idempotencyKey),
  cancelBeneficiaryRequest: (requestId: string, csrfToken: string, idempotencyKey: string) => mutateResource<ProviderPayload>("POST", `${base("affiliate")}/beneficiary-change-requests/${encodeURIComponent(requestId)}/cancel`, csrfToken, idempotencyKey),
};
