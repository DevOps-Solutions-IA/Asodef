import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditEventResult, ConversationIdentityAssurance, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  hasIdentityAssurance,
  resolveCanonicalIdentityLevel,
  type IdentityAssuranceLevel,
  type ResolvedIdentityContext,
} from "./contracts/identity-resolution.contract";
import { safeEvidence } from "./identity-resolution.service";

export interface BindConversationIdentityInput {
  conversationId: string;
  identity: ResolvedIdentityContext;
  reason: string;
  evidenceReference: string;
  correlationId: string;
  idempotencyKey: string;
}

@Injectable()
export class ConversationIdentityBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async bind(input: BindConversationIdentityInput) {
    return this.bindInternal(input, false);
  }

  /** Records progressive evidence without treating the historical maximum as
   * current authorization. A request whose live assurance is lower (logout,
   * MFA/step-up expiry or anonymous reconnect) keeps the append-only binding
   * intact and writes only a sanitized effective-assurance timeline event. */
  async bindEffective(input: BindConversationIdentityInput) {
    return this.bindInternal(input, true);
  }

  private async bindInternal(input: BindConversationIdentityInput, retainHistoricalOnLowerAssurance: boolean) {
    return this.prisma.$transaction(
      (tx) => this.bindInTransaction(tx, input, retainHistoricalOnLowerAssurance),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /** Atomic composition boundary for server-owned identity workflows. The
   * caller supplies an existing transaction; validation and the identity
   * advisory lock remain identical to bind()/bindEffective(). */
  async bindInTransaction(
    tx: Prisma.TransactionClient,
    input: BindConversationIdentityInput,
    retainHistoricalOnLowerAssurance = false,
  ) {
    validateIdentityEvidence(input.identity);
    const reason = boundedText(input.reason, "INVALID_IDENTITY_REASON", 500);
    const evidenceReference = safeEvidence(input.evidenceReference);
    const correlationId = boundedText(input.correlationId, "INVALID_CORRELATION_ID", 200);
    const idempotencyKey = boundedText(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", 200);

      await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`koral-identity:${input.conversationId}`}, 0))`,
      );
      const conversation = await tx.conversation.findUnique({ where: { id: input.conversationId }, select: { id: true } });
      if (!conversation) throw new NotFoundException("CONVERSATION_NOT_FOUND");

      const replay = await tx.conversationIdentityBinding.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: input.conversationId, idempotencyKey } },
      });
      if (replay) {
        if (
          replay.identityId !== input.identity.identityId
          || replay.newAssurance !== input.identity.assuranceLevel
          || replay.contactId !== (input.identity.contactId ?? null)
          || replay.portalUserId !== (input.identity.portalUserId ?? null)
          || replay.reason !== reason
          || replay.evidenceReference !== evidenceReference
        ) throw new ConflictException("IDENTITY_BINDING_IDEMPOTENCY_CONFLICT");
        return { binding: replay, replayed: true };
      }

      const previous = await latestBinding(tx, input.conversationId);
      if (previous) {
        if (
          previous.identityId !== input.identity.identityId
          && hasIdentityAssurance(previous.newAssurance as IdentityAssuranceLevel, "MATCHED")
          && hasIdentityAssurance(input.identity.assuranceLevel, "MATCHED")
        ) throw new ConflictException("IDENTITY_CONFLICT");
        if (!hasIdentityAssurance(input.identity.assuranceLevel, previous.newAssurance as IdentityAssuranceLevel)) {
          if (!retainHistoricalOnLowerAssurance) throw new ConflictException("ASSURANCE_DOWNGRADE_REJECTED");
          const effectiveEventKey = `identity-effective:${idempotencyKey}`;
          const effectiveReplay = await tx.conversationEvent.findUnique({
            where: { conversationId_idempotencyKey: { conversationId: input.conversationId, idempotencyKey: effectiveEventKey } },
          });
          if (effectiveReplay) {
            const metadata = jsonObject(effectiveReplay.metadata);
            if (
              effectiveReplay.eventType !== "IDENTITY_EFFECTIVE_ASSURANCE_REDUCED"
              || effectiveReplay.reason !== reason
              || metadata.identityId !== input.identity.identityId
              || metadata.effectiveAssurance !== input.identity.assuranceLevel
              || metadata.evidenceReference !== evidenceReference
            ) throw new ConflictException("IDENTITY_BINDING_IDEMPOTENCY_CONFLICT");
            return { binding: previous, replayed: true, historicalAssuranceRetained: true, effectiveIdentity: input.identity };
          }
          await tx.conversationEvent.create({
            data: {
              conversationId: input.conversationId,
              eventType: "IDENTITY_EFFECTIVE_ASSURANCE_REDUCED",
              correlationId,
              idempotencyKey: effectiveEventKey,
              reason,
              result: AuditEventResult.SUCCESS,
              metadata: {
                identityId: input.identity.identityId,
                historicalAssurance: previous.newAssurance,
                effectiveAssurance: input.identity.assuranceLevel,
                evidenceReference,
              },
            },
          });
          return { binding: previous, replayed: false, historicalAssuranceRetained: true, effectiveIdentity: input.identity };
        }
        if (
          previous.identityId !== input.identity.identityId
          && hasIdentityAssurance(previous.newAssurance as IdentityAssuranceLevel, "MATCHED")
        ) throw new ConflictException("IDENTITY_CONFLICT");
      }

      const binding = await tx.conversationIdentityBinding.create({
        data: {
          conversationId: input.conversationId,
          identityId: boundedText(input.identity.identityId, "INVALID_IDENTITY_ID", 200),
          contactId: optionalBounded(input.identity.contactId),
          portalUserId: optionalBounded(input.identity.portalUserId),
          previousAssurance: previous?.newAssurance,
          newAssurance: input.identity.assuranceLevel as ConversationIdentityAssurance,
          reason,
          evidenceReference,
          correlationId,
          idempotencyKey,
        },
      });
      await tx.conversation.update({ where: { id: input.conversationId }, data: { version: { increment: 1 } } });
      await tx.conversationEvent.create({
        data: {
          conversationId: input.conversationId,
          eventType: "IDENTITY_ASSURANCE_CHANGED",
          correlationId,
          idempotencyKey: `identity:${idempotencyKey}`,
          reason,
          result: AuditEventResult.SUCCESS,
          metadata: {
            identityId: input.identity.identityId,
            previousAssurance: previous?.newAssurance ?? null,
            newAssurance: input.identity.assuranceLevel,
            evidenceReference,
          },
        },
      });
      return { binding, replayed: false };
  }

  async findLatest(conversationId: string) {
    return latestBinding(this.prisma, conversationId);
  }
}

type IdentityBindingClient = Pick<Prisma.TransactionClient, "conversationIdentityBinding">;

function latestBinding(client: IdentityBindingClient, conversationId: string) {
  return client.conversationIdentityBinding.findFirst({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

function validateIdentityEvidence(identity: ResolvedIdentityContext): void {
  const canonical = resolveCanonicalIdentityLevel(identity);
  if (hasIdentityAssurance(identity.assuranceLevel, "AUTHENTICATED")) {
    if (canonical !== identity.assuranceLevel) throw new ConflictException("INSUFFICIENT_AUTHENTICATION_EVIDENCE");
  } else if (
    identity.authenticationEvidence.authenticated
    || identity.authenticationEvidence.mfaVerified
    || identity.authenticationEvidence.stepUpVerified
  ) {
    throw new ConflictException("INCONSISTENT_IDENTITY_EVIDENCE");
  }
}

function boundedText(value: string, code: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || containsControlCharacter(normalized)) throw new BadRequestException(code);
  return normalized;
}

function optionalBounded(value?: string): string | undefined {
  return value === undefined ? undefined : boundedText(value, "INVALID_IDENTITY_REFERENCE", 200);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object") return {};
  return value;
}
