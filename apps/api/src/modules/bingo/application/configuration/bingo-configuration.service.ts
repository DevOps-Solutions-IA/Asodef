import { BingoAuditResult, Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { positionMask, validatePatternDefinition } from "../../domain/patterns";
import {
  evaluateEventConfigurationChange,
  isRoundConfigurationFrozen,
} from "../../domain/lifecycle";
import type {
  CreateBingoEventDto,
  CreateBingoPatternDto,
  CreateBingoPrizeDto,
  CreateBingoRoundDto,
  UpdateBingoEventDto,
  UpdateBingoPatternDto,
  UpdateBingoPrizeDto,
  UpdateBingoRoundDto,
} from "../../contracts/admin";
import { PrismaBingoAuditRepository, type BingoAuditAction } from "../audit";
import { PrismaBingoIdempotencyRepository, type BingoMutatingOperation } from "../idempotency";
import {
  BingoApplicationError,
  BingoApplicationErrorCode,
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import { PrismaBingoOutboxRepository, type BingoOutboxEventType } from "../outbox";
import { PrismaOutcomeOutboxSequenceAllocator } from "../outcomes";

type ConfigurationResource = "EVENT" | "ROUND" | "PATTERN" | "PRIZE";
type ConfigurationResult = Readonly<{
  resourceType: ConfigurationResource;
  resourceId: string;
  eventId: string;
  status: string;
  configurationVersion: number;
  replayed: boolean;
}>;

export class BingoConfigurationService {
  constructor(
    private readonly kernel: BingoTransactionKernel,
    private readonly locks = new BingoLockManager(),
    private readonly idempotency = new PrismaBingoIdempotencyRepository(),
    private readonly audit = new PrismaBingoAuditRepository(),
    private readonly outbox = new PrismaBingoOutboxRepository(),
    private readonly sequence = new PrismaOutcomeOutboxSequenceAllocator(),
  ) {}

  createEvent(input: CreateBingoEventDto, context: CommandContext): Promise<ConfigurationResult> {
    this.requireManage(context, "bingo.create");
    const command = canonicalEventCreate(input);
    return this.kernel.execute(context, {
      command: "bingo.event.create",
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      idempotent: true,
    }, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`asodef:bingo:event-slug:${command.slug}`}, 0))`;
      const existing = await tx.bingoEvent.findUnique({ where: { slug: command.slug } });
      if (existing !== null) {
        const replay = await this.acquire(tx, existing.id, "CREATE_EVENT", command, context);
        if (replay.replayId !== undefined) return { ...await this.resourceResult(tx, "EVENT", replay.replayId), replayed: true };
        throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, { field: "slug" });
      }
      const startsAt = new Date(command.startsAt);
      const endsAt = command.endsAt === undefined ? undefined : new Date(command.endsAt);
      if (endsAt !== undefined && endsAt <= startsAt) invalidConfiguration("endsAt");
      const event = await tx.bingoEvent.create({
        data: {
          slug: command.slug,
          name: command.name,
          description: command.description,
          visibility: command.visibility,
          eligibilityPolicy: command.eligibilityPolicy,
          maxCardsPerParticipant: command.maxCardsPerParticipant,
          publicWinnerVisibility: command.publicWinnerVisibility,
          defaultValidationPolicy: command.validationPolicy,
          fairnessMode: command.fairnessMode,
          scheduledStartAt: startsAt,
          metadata: endsAt === undefined ? undefined : { scheduledEndAt: endsAt.toISOString() },
          createdByUserId: context.actor.userId,
          updatedByUserId: context.actor.userId,
        },
      });
      const acquired = await this.acquire(tx, event.id, "CREATE_EVENT", command, context);
      if (acquired.recordId === undefined) throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE);
      await this.record(tx, {
        eventId: event.id,
        resourceId: event.id,
        resourceType: "EVENT",
        action: "bingo.event.created.v1",
        operation: "CREATE_EVENT",
        configurationVersion: event.configurationVersion,
        status: event.status,
        idempotencyRecordId: acquired.recordId,
      }, context);
      return { ...await this.resourceResult(tx, "EVENT", event.id), replayed: false };
    });
  }

  updateEvent(eventId: string, input: UpdateBingoEventDto, context: CommandContext) {
    return this.mutateExisting("EVENT", eventId, undefined, "UPDATE_EVENT", "bingo.event.updated.v1", input, context,
      async (tx, _event) => {
        const current = await tx.bingoEvent.findUnique({ where: { id: eventId } });
        if (current === null) notFound();
        const startsAt = input.startsAt === undefined ? current.scheduledStartAt : new Date(input.startsAt);
        const storedEnd = jsonString(current.metadata, "scheduledEndAt");
        const endsAt = input.endsAt === undefined ? storedEnd : input.endsAt;
        if (startsAt !== null && endsAt !== undefined && new Date(endsAt) <= startsAt) invalidConfiguration("endsAt");
        const before = eventCritical(current);
        const after = eventCritical({ ...current, ...input });
        const decision = evaluateEventConfigurationChange(current.status, current.configurationLockedAt, { before, after });
        if (!decision.allowed) configurationLocked(decision.details);
        return tx.bingoEvent.update({
          where: { id: eventId },
          data: {
            name: input.name,
            description: input.description,
            visibility: input.visibility,
            eligibilityPolicy: input.eligibilityPolicy,
            maxCardsPerParticipant: input.maxCardsPerParticipant,
            publicWinnerVisibility: input.publicWinnerVisibility,
            defaultValidationPolicy: input.validationPolicy,
            scheduledStartAt: startsAt,
            metadata: endsAt === undefined ? current.metadata ?? undefined : mergeJson(current.metadata, { scheduledEndAt: endsAt }),
            configurationVersion: { increment: 1 },
            updatedByUserId: context.actor.userId,
          },
        });
      });
  }

  createRound(eventId: string, input: CreateBingoRoundDto, context: CommandContext) {
    return this.mutateExisting("ROUND", eventId, undefined, "CREATE_ROUND", "bingo.round.created.v1", input, context,
      async (tx, event) => {
        if (event.configurationLockedAt !== null || !["DRAFT", "CONFIGURED"].includes(event.status)) configurationLocked();
        validateSpecialTie(input.tiePolicy, input.specialTieRuleRef);
        const round = await tx.bingoRound.create({ data: {
          eventId, sequence: input.order, name: input.name,
          tiePolicy: input.tiePolicy, validationPolicy: input.validationPolicy,
          tiePolicyConfiguration: input.specialTieRuleRef === undefined ? undefined : { specialRuleRef: input.specialTieRuleRef },
          createdByUserId: context.actor.userId,
        }});
        await bumpEvent(tx, eventId, context.actor.userId);
        return round;
      });
  }

  updateRound(eventId: string, roundId: string, input: UpdateBingoRoundDto, context: CommandContext) {
    return this.mutateExisting("ROUND", eventId, roundId, "UPDATE_ROUND", "bingo.round.updated.v1", input, context,
      async (tx) => {
        const round = await tx.bingoRound.findFirst({ where: { id: roundId, eventId } });
        if (round === null) notFound();
        if (isRoundConfigurationFrozen(round.status, round.configurationLockedAt)) configurationLocked();
        const tiePolicy = input.tiePolicy ?? round.tiePolicy;
        const specialTieRuleRef = input.specialTieRuleRef ??
          (input.tiePolicy !== undefined && input.tiePolicy !== "PRECONFIGURED_SPECIAL_RULE"
            ? undefined
            : jsonString(round.tiePolicyConfiguration, "specialRuleRef"));
        validateSpecialTie(tiePolicy, specialTieRuleRef);
        const updated = await tx.bingoRound.update({ where: { id: roundId }, data: {
          name: input.name, tiePolicy: input.tiePolicy, validationPolicy: input.validationPolicy,
          tiePolicyConfiguration: specialTieRuleRef === undefined ? Prisma.DbNull : { specialRuleRef: specialTieRuleRef },
          configurationVersion: { increment: 1 },
        }});
        await bumpEvent(tx, eventId, context.actor.userId);
        return updated;
      });
  }

  createPattern(eventId: string, roundId: string, input: CreateBingoPatternDto, context: CommandContext) {
    return this.mutateExisting("PATTERN", eventId, roundId, "CREATE_PATTERN", "bingo.pattern.created.v1", input, context,
      async (tx) => this.persistPattern(tx, eventId, roundId, input, context, null));
  }

  updatePattern(eventId: string, roundId: string, patternId: string, input: UpdateBingoPatternDto, context: CommandContext) {
    return this.mutateExisting("PATTERN", eventId, roundId, "UPDATE_PATTERN", "bingo.pattern.updated.v1", input, context,
      async (tx) => {
        const pattern = await tx.bingoPattern.findFirst({ where: { id: patternId, eventId }, include: { masks: { orderBy: { sequence: "asc" } }, rounds: { where: { roundId } } } });
        if (pattern === null || pattern.rounds.length !== 1) notFound();
        const round = await tx.bingoRound.findUnique({ where: { id: roundId } });
        if (round === null) notFound();
        if (isRoundConfigurationFrozen(round.status, round.configurationLockedAt)) configurationLocked();
        const structuralChange = input.kind !== undefined || input.masks !== undefined || input.includeFreeCenter !== undefined;
        if (structuralChange) {
          const derivedMasks = await tx.bingoCardPatternMask.count({ where: { patternId } });
          if (derivedMasks > 0) configurationLocked({ reason: "DERIVED_CARD_MASKS_EXIST" });
        }
        const masks = input.masks ?? pattern.masks.map((mask) => ({ positions: positions(mask.positionMask) }));
        const definition = normalizePattern({ name: input.name ?? pattern.name, kind: input.kind ?? pattern.kind, masks, includeFreeCenter: input.includeFreeCenter });
        validatePatternDefinition({ id: pattern.id, kind: definition.kind, requiredMatchCount: definition.requiredMatchCount, configurationFrozen: false, masks: definition.masks.map((mask, i) => ({ id: `${pattern.id}:${i + 1}`, sequence: i + 1, positionMask: mask })) }, { requireFrozen: false });
        if (structuralChange) await tx.bingoPatternMask.deleteMany({ where: { patternId } });
        const updated = await tx.bingoPattern.update({ where: { id: patternId }, data: {
          name: definition.name,
          ...(structuralChange ? { kind: definition.kind, requiredMatchCount: definition.requiredMatchCount, masks: { create: definition.masks.map((mask, i) => ({ sequence: i + 1, positionMask: mask })) } } : {}),
        } });
        await bumpRoundAndEvent(tx, eventId, roundId, context.actor.userId);
        return updated;
      });
  }

  createPrize(eventId: string, roundId: string, input: CreateBingoPrizeDto, context: CommandContext) {
    return this.mutateExisting("PRIZE", eventId, roundId, "CREATE_PRIZE", "bingo.prize.created.v1", input, context,
      async (tx) => {
        await assertDraftRound(tx, eventId, roundId);
        const values = prizeValues(input);
        const aggregate = await tx.bingoPrize.aggregate({ where: { roundId }, _max: { sequence: true } });
        const prize = await tx.bingoPrize.create({ data: { eventId, roundId, sequence: (aggregate._max.sequence ?? 0) + 1, name: input.name, description: input.description, kind: input.kind, ...values } });
        await bumpRoundAndEvent(tx, eventId, roundId, context.actor.userId);
        return prize;
      });
  }

  updatePrize(eventId: string, roundId: string, prizeId: string, input: UpdateBingoPrizeDto, context: CommandContext) {
    return this.mutateExisting("PRIZE", eventId, roundId, "UPDATE_PRIZE", "bingo.prize.updated.v1", input, context,
      async (tx) => {
        await assertDraftRound(tx, eventId, roundId);
        const current = await tx.bingoPrize.findFirst({ where: { id: prizeId, eventId, roundId } });
        if (current === null) notFound();
        const kind = input.kind ?? current.kind;
        const values = prizeValues({
          kind,
          monetaryAmount: kind === "IN_KIND" ? input.monetaryAmount : input.monetaryAmount ?? (current.amountMinor === null ? undefined : formatMinor(current.amountMinor)),
          currency: kind === "IN_KIND" ? input.currency : input.currency ?? current.currency ?? undefined,
        });
        const prize = await tx.bingoPrize.update({ where: { id: prizeId }, data: { name: input.name, description: input.description, kind: input.kind, ...values } });
        await bumpRoundAndEvent(tx, eventId, roundId, context.actor.userId);
        return prize;
      });
  }

  private async persistPattern(tx: PrismaTypes.TransactionClient, eventId: string, roundId: string, input: CreateBingoPatternDto, context: CommandContext, _unused: null) {
    await assertDraftRound(tx, eventId, roundId);
    const definition = normalizePattern(input);
    const aggregate = await tx.bingoRoundPattern.aggregate({ where: { roundId }, _max: { sequence: true } });
    const code = `${definition.kind.toLowerCase()}-${(aggregate._max.sequence ?? 0) + 1}`;
    validatePatternDefinition({ id: code, kind: definition.kind, requiredMatchCount: definition.requiredMatchCount, configurationFrozen: false, masks: definition.masks.map((mask, i) => ({ id: `${code}:${i + 1}`, sequence: i + 1, positionMask: mask })) }, { requireFrozen: false });
    const pattern = await tx.bingoPattern.create({ data: { eventId, code, name: definition.name, kind: definition.kind, requiredMatchCount: definition.requiredMatchCount, masks: { create: definition.masks.map((mask, i) => ({ sequence: i + 1, positionMask: mask })) } } });
    await tx.bingoRoundPattern.create({ data: { eventId, roundId, patternId: pattern.id, sequence: (aggregate._max.sequence ?? 0) + 1 } });
    await bumpRoundAndEvent(tx, eventId, roundId, context.actor.userId);
    return pattern;
  }

  private async mutateExisting(resourceType: ConfigurationResource, eventId: string, roundId: string | undefined, operation: BingoMutatingOperation, action: BingoAuditAction & BingoOutboxEventType, request: unknown, context: CommandContext, mutate: (tx: PrismaTypes.TransactionClient, event: { status: string; configurationLockedAt: Date | null }) => Promise<{ id: string; status?: string; configurationVersion?: number }>): Promise<ConfigurationResult> {
    this.requireManage(context);
    return this.kernel.execute(context, { command: action, isolationLevel: Prisma.TransactionIsolationLevel.Serializable, idempotent: true }, async (tx) => {
      await this.locks.acquire(tx, { eventId, roundId });
      const event = await tx.bingoEvent.findUnique({ where: { id: eventId }, select: { status: true, configurationLockedAt: true } });
      if (event === null) notFound();
      const acquired = await this.acquire(tx, eventId, operation, request, context);
      if (acquired.replayId !== undefined) {
        return { ...await this.resourceResult(tx, resourceType, acquired.replayId), replayed: true };
      }
      const resource = await mutate(tx, event);
      const final = await this.resourceResult(tx, resourceType, resource.id);
      if (acquired.recordId === undefined) throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE);
      await this.record(tx, { eventId, roundId, resourceId: resource.id, resourceType, action, operation, configurationVersion: final.configurationVersion, status: final.status, idempotencyRecordId: acquired.recordId }, context);
      return { ...final, replayed: false };
    });
  }

  private async acquire(tx: PrismaTypes.TransactionClient, eventId: string, operation: BingoMutatingOperation, request: unknown, context: CommandContext): Promise<{ recordId?: string; replayId?: string }> {
    const acquisition = await this.idempotency.acquire(tx, { eventId, actorUserId: context.actor.userId, scope: `event:${eventId}`, operation, idempotencyKey: context.idempotencyKey, request: compact(request), now: context.clock.now() });
    if (acquisition.kind === "IN_PROGRESS") throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, { reason: "IDEMPOTENCY_IN_PROGRESS" });
    return acquisition.kind === "REPLAY"
      ? { replayId: acquisition.result.resourceId }
      : { recordId: acquisition.recordId };
  }

  private async record(tx: PrismaTypes.TransactionClient, change: { eventId: string; roundId?: string; resourceId: string; resourceType: ConfigurationResource; action: BingoAuditAction & BingoOutboxEventType; operation: BingoMutatingOperation; configurationVersion: number; status: string; idempotencyRecordId: string }, context: CommandContext) {
    const now = context.clock.now();
    const sequence = await this.sequence.next(tx, change.eventId);
    await this.audit.append(tx, { eventId: change.eventId, roundId: change.roundId, actorUserId: context.actor.userId, actorPermission: change.operation === "CREATE_EVENT" ? "bingo.create" : "bingo.manage", action: change.action, result: BingoAuditResult.SUCCEEDED, requestId: context.requestId, idempotencyKeyHash: context.idempotencyKeyHash, newState: { status: change.status, stateVersion: change.configurationVersion }, metadata: { schemaVersion: 1, entityId: change.resourceId }, occurredAt: now });
    await this.outbox.append(tx, { eventId: change.eventId, sequence, eventType: change.action, aggregateType: change.resourceType, aggregateId: change.resourceId, aggregateVersion: BigInt(change.configurationVersion), payload: { schemaVersion: 1, resourceId: change.resourceId, resourceType: change.resourceType, eventId: change.eventId, configurationVersion: change.configurationVersion, occurredAt: now.toISOString() }, createdAt: now });
    await this.idempotency.succeed(tx, change.idempotencyRecordId, { schemaVersion: 1, resourceType: change.resourceType, resourceId: change.resourceId, status: change.status }, now);
  }

  private async resourceResult(tx: PrismaTypes.TransactionClient, type: ConfigurationResource, id: string): Promise<Omit<ConfigurationResult, "replayed">> {
    if (type === "EVENT") { const row = await tx.bingoEvent.findUnique({ where: { id }, select: { id: true, status: true, configurationVersion: true } }); if (row === null) notFound(); return { resourceType: type, resourceId: row.id, eventId: row.id, status: row.status, configurationVersion: row.configurationVersion }; }
    if (type === "ROUND") { const row = await tx.bingoRound.findUnique({ where: { id }, select: { id: true, eventId: true, status: true, configurationVersion: true } }); if (row === null) notFound(); return { resourceType: type, resourceId: row.id, eventId: row.eventId, status: row.status, configurationVersion: row.configurationVersion }; }
    if (type === "PATTERN") { const row = await tx.bingoPattern.findUnique({ where: { id }, select: { id: true, eventId: true, version: true } }); if (row === null) notFound(); return { resourceType: type, resourceId: row.id, eventId: row.eventId, status: "CONFIGURED", configurationVersion: row.version }; }
    const row = await tx.bingoPrize.findUnique({ where: { id }, select: { id: true, eventId: true } }); if (row === null) notFound(); return { resourceType: type, resourceId: row.id, eventId: row.eventId, status: "CONFIGURED", configurationVersion: 1 };
  }

  private requireManage(context: CommandContext, alternative?: string) {
    if (!context.actor.permissions.has("bingo.manage") && (alternative === undefined || !context.actor.permissions.has(alternative))) throw new BingoApplicationError(BingoApplicationErrorCode.FORBIDDEN, { permission: alternative ?? "bingo.manage" });
  }
}

function canonicalEventCreate(input: CreateBingoEventDto) { return { ...input, slug: input.slug.trim(), name: input.name.trim(), description: input.description?.trim() }; }
function notFound(): never { throw new BingoApplicationError(BingoApplicationErrorCode.NOT_FOUND); }
function invalidConfiguration(field: string): never { throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, { field }); }
function configurationLocked(details?: unknown): never { throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, { reason: "BINGO_CONFIGURATION_LOCKED", details }); }
function jsonString(value: PrismaTypes.JsonValue | null, key: string): string | undefined { return value !== null && !Array.isArray(value) && typeof value === "object" && typeof value[key] === "string" ? value[key] : undefined; }
function mergeJson(value: PrismaTypes.JsonValue | null, extra: Record<string, string>): PrismaTypes.InputJsonObject { return { ...(value !== null && !Array.isArray(value) && typeof value === "object" ? value : {}), ...extra } as PrismaTypes.InputJsonObject; }
function eventCritical(value: { visibility: string; eligibilityPolicy: string; maxCardsPerParticipant: number; publicWinnerVisibility: string; defaultValidationPolicy?: string; validationPolicy?: string; fairnessMode: string }) { return { visibility: value.visibility, eligibilityPolicy: value.eligibilityPolicy, maxCardsPerParticipant: value.maxCardsPerParticipant, publicWinnerVisibility: value.publicWinnerVisibility, defaultValidationPolicy: value.defaultValidationPolicy ?? value.validationPolicy, fairnessMode: value.fairnessMode, eligibilityRules: [], retentionPolicy: null }; }
function validateSpecialTie(policy: string, ref?: string) { if (policy === "PRECONFIGURED_SPECIAL_RULE" && ref === undefined) invalidConfiguration("specialTieRuleRef"); if (policy !== "PRECONFIGURED_SPECIAL_RULE" && ref !== undefined) invalidConfiguration("specialTieRuleRef"); }
function normalizePattern(input: { name: string; kind: CreateBingoPatternDto["kind"]; masks: { positions: number[] }[]; includeFreeCenter?: boolean }) { const masks = input.masks.map((mask) => positionMask(...new Set(input.includeFreeCenter === false ? mask.positions.filter((value) => value !== 12) : mask.positions))); return { name: input.name.trim(), kind: input.kind, masks, requiredMatchCount: input.kind === "TWO_LINES" ? 2 : 1 }; }
function positions(mask: number): number[] { const result: number[] = []; for (let i = 0; i < 25; i += 1) if ((mask & 2 ** i) !== 0) result.push(i); return result; }
async function assertDraftRound(tx: PrismaTypes.TransactionClient, eventId: string, roundId: string) { const round = await tx.bingoRound.findFirst({ where: { id: roundId, eventId } }); if (round === null) notFound(); if (isRoundConfigurationFrozen(round.status, round.configurationLockedAt)) configurationLocked(); }
async function bumpEvent(tx: PrismaTypes.TransactionClient, eventId: string, actor: string) { await tx.bingoEvent.update({ where: { id: eventId }, data: { configurationVersion: { increment: 1 }, updatedByUserId: actor } }); }
async function bumpRoundAndEvent(tx: PrismaTypes.TransactionClient, eventId: string, roundId: string, actor: string) { await tx.bingoRound.update({ where: { id: roundId }, data: { configurationVersion: { increment: 1 } } }); await bumpEvent(tx, eventId, actor); }
function prizeValues(input: { kind: string; monetaryAmount?: string; currency?: string }) { if (input.kind === "MONETARY") { if (input.monetaryAmount === undefined || input.currency === undefined) invalidConfiguration("monetaryAmount"); const [whole, fraction = ""] = input.monetaryAmount.split("."); const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0")); if (minor > 2_147_483_647n) invalidConfiguration("monetaryAmount"); return { amountMinor: Number(minor), currency: input.currency }; } if (input.monetaryAmount !== undefined || input.currency !== undefined) invalidConfiguration("monetaryAmount"); return { amountMinor: null, currency: null }; }
function formatMinor(minor: number) { return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`; }
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, compact(item)]));
  }
  return value;
}
