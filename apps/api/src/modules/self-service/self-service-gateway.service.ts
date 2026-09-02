import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { EXTERNAL_CORE_PROVIDER, type ExternalCoreProvider, type ProviderResult } from "./external-core.provider";
import { SelfServiceCryptoService } from "./self-service-crypto.service";
import type { SelfServicePrincipal } from "./self-service-session.service";
import type { EnvConfig } from "../../config/env.validation";

type PublicScalar = string | number | boolean | null;
type PublicProviderPayload = Readonly<Record<string, PublicScalar>>;

export const SELF_SERVICE_PUBLIC_FIELDS = {
  affiliateSummary: ["displayName", "identifierMasked", "status", "updatedAt"],
  beneficiaries: ["id", "displayName", "relationship", "status", "updatedAt"],
  accountStatement: ["reference", "label", "amount", "currency", "status", "dueDate", "updatedAt"],
  obligations: ["id", "reference", "label", "amount", "currency", "status", "dueDate"],
  payments: ["id", "reference", "amount", "currency", "status", "date"],
  receipts: ["id", "reference", "status", "date", "downloadUrl"],
  documents: ["id", "title", "documentType", "status", "date", "downloadUrl"],
  requests: ["id", "reference", "requestType", "status", "createdAt", "updatedAt"],
  beneficiaryRules: ["title", "description", "status", "updatedAt"],
  companySummary: ["displayName", "nitMasked", "status", "updatedAt"],
  benefits: ["id", "title", "description", "status", "updatedAt"],
  contracts: ["id", "reference", "title", "status", "effectiveDate", "updatedAt"],
  reports: ["id", "title", "status", "createdAt", "downloadUrl"],
  paymentOperation: ["id", "reference", "amount", "currency", "status", "createdAt", "updatedAt"],
  changeRequest: ["id", "reference", "status", "createdAt", "updatedAt"],
  contactUpdate: ["requestId", "status", "channel", "maskedDestination", "expiresAt", "retryAfterSeconds", "providerReference", "updatedAt"],
} as const;

const MUTATION_PUBLIC_FIELDS: Readonly<Record<string, readonly string[]>> = {
  BENEFICIARY_CHANGE_CREATE: SELF_SERVICE_PUBLIC_FIELDS.changeRequest,
  BENEFICIARY_CHANGE_UPDATE: SELF_SERVICE_PUBLIC_FIELDS.changeRequest,
  BENEFICIARY_CHANGE_DOCUMENT: SELF_SERVICE_PUBLIC_FIELDS.changeRequest,
  BENEFICIARY_CHANGE_SUBMIT: SELF_SERVICE_PUBLIC_FIELDS.changeRequest,
  BENEFICIARY_CHANGE_CANCEL: SELF_SERVICE_PUBLIC_FIELDS.changeRequest,
  PAYMENT_APPLY_CONFIRMED: SELF_SERVICE_PUBLIC_FIELDS.paymentOperation,
  CONTACT_UPDATE_START: SELF_SERVICE_PUBLIC_FIELDS.contactUpdate,
  CONTACT_UPDATE_REQUEST_CODE: SELF_SERVICE_PUBLIC_FIELDS.contactUpdate,
  CONTACT_UPDATE_VERIFY: SELF_SERVICE_PUBLIC_FIELDS.contactUpdate,
};

@Injectable()
export class SelfServiceGatewayService {
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SelfServiceCryptoService,
    @Inject(EXTERNAL_CORE_PROVIDER) readonly core: ExternalCoreProvider,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.timeoutMs = config.get("EXTERNAL_CORE_TIMEOUT_MS", { infer: true });
  }

  assertScope(principal: SelfServicePrincipal, scope: string): void {
    if (principal.assurance !== "OTP" || !principal.scopes.includes(scope)) throw new ServiceUnavailableException("La sesión no autoriza esta operación.");
  }

  async read<T>(operation: () => Promise<ProviderResult<T>>, options: { retry?: boolean } = {}): Promise<ProviderResult<T>> {
    try {
      const first = await this.withTimeout(operation);
      if (first.status === "UNAVAILABLE" && first.error.retryable && options.retry) return await this.withTimeout(operation);
      return first;
    }
    catch { return { status: "UNAVAILABLE", error: { code: "EXTERNAL_CORE_UNAVAILABLE", message: "El servicio externo no está disponible.", retryable: true } }; }
  }

  async readPayload(operation: () => Promise<ProviderResult<Readonly<Record<string, unknown>>>>, allowedFields: readonly string[], retry = true): Promise<ProviderResult<PublicProviderPayload>> {
    const result = await this.read(operation, { retry });
    return this.sanitizePayloadResult(result, allowedFields);
  }

  async readCollection(operation: () => Promise<ProviderResult<readonly Readonly<Record<string, unknown>>[]>>, allowedFields: readonly string[], retry = true): Promise<ProviderResult<readonly PublicProviderPayload[]>> {
    const result = await this.read(operation, { retry });
    if (result.status !== "VERIFIED") return result;
    return { status: "VERIFIED", data: result.data.map((item) => this.pickPublicScalars(item, allowedFields)) };
  }

  async mutate<T>(principal: SelfServicePrincipal, operationName: string, idempotencyKey: string | undefined, payload: unknown, operation: () => Promise<ProviderResult<T>>): Promise<ProviderResult<PublicProviderPayload>> {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) throw new BadRequestException("Idempotency-Key inválida o ausente.");
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > 32_768) throw new BadRequestException("La solicitud supera el tamaño permitido.");
    const requestHash = this.crypto.hash(serialized);
    const existing = await this.prisma.selfServiceIdempotency.findUnique({ where: { sessionId_operation_key: { sessionId: principal.sessionId, operation: operationName, key: idempotencyKey } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictException("La clave de idempotencia ya fue usada con otra solicitud.");
      return this.sanitizePayloadResult(existing.response as ProviderResult<unknown>, MUTATION_PUBLIC_FIELDS[operationName] ?? []);
    }
    const result = this.sanitizePayloadResult(await this.read(operation), MUTATION_PUBLIC_FIELDS[operationName] ?? []);
    if (result.status !== "VERIFIED") return result;
    try {
      await this.prisma.selfServiceIdempotency.create({ data: { sessionId: principal.sessionId, operation: operationName, key: idempotencyKey, requestHash, response: result as unknown as Prisma.InputJsonValue } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await this.prisma.selfServiceIdempotency.findUnique({ where: { sessionId_operation_key: { sessionId: principal.sessionId, operation: operationName, key: idempotencyKey } } });
      if (!raced || raced.requestHash !== requestHash) throw new ConflictException("Conflicto de idempotencia.");
      return this.sanitizePayloadResult(raced.response as ProviderResult<unknown>, MUTATION_PUBLIC_FIELDS[operationName] ?? []);
    }
    await this.prisma.selfServiceAuditEvent.create({ data: { portal: principal.portal, action: operationName, outcome: result.status, sessionId: principal.sessionId, subjectHash: this.crypto.fingerprint(principal.subjectRef) } });
    return result;
  }

  private sanitizePayloadResult<T>(result: ProviderResult<T>, allowedFields: readonly string[]): ProviderResult<PublicProviderPayload> {
    if (result.status !== "VERIFIED") return result;
    if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
      return { status: "UNAVAILABLE", error: { code: "INVALID_EXTERNAL_RESPONSE", message: "El servicio externo devolvió una respuesta no válida.", retryable: false } };
    }
    return { status: "VERIFIED", data: this.pickPublicScalars(result.data as Readonly<Record<string, unknown>>, allowedFields) };
  }

  private pickPublicScalars(payload: Readonly<Record<string, unknown>>, allowedFields: readonly string[]): PublicProviderPayload {
    return Object.fromEntries(allowedFields.flatMap((field) => {
      const value = payload[field];
      return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? [[field, value] as const]
        : [];
    }));
  }

  private async withTimeout<T>(operation: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("External core request timed out")), this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
