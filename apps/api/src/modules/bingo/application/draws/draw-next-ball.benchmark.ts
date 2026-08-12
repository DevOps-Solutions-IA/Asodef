import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { createBingoFixture } from "../../../../database/bingo-test-fixture";
import {
  ballMask,
  BingoCardGenerator,
  toPostgresBit75,
} from "../../domain/cards";
import { positionsFromMask } from "../../domain/patterns";
import type { RandomSource } from "../../domain/random";
import { PrismaBingoAuditRepository } from "../audit";
import { BINGO_DRAW_EVIDENCE_VERSION, type BallSelector } from "../fairness";
import { PrismaBingoIdempotencyRepository } from "../idempotency";
import {
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import { PrismaBingoOutboxRepository } from "../outbox";
import { DrawNextBallService } from "./draw-next-ball.service";

const DATASET_SIZES = (process.env.BINGO_BENCHMARK_SIZES ?? "5000,10000,25000,50000")
  .split(",")
  .map((value) => Number(value));
const WARMUPS = 2;
const SAMPLES = 7;
const INSERT_CHUNK = 1_000;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  nextInt(maxExclusive: number): number {
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / maxExclusive) * maxExclusive;
    let value: number;
    do value = this.nextUint32();
    while (value >= limit);
    return value % maxExclusive;
  }

  private nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower);
}

const rounded = (value: number) => Math.round(value * 1_000) / 1_000;

async function createManyInChunks<T>(
  values: readonly T[],
  create: (chunk: readonly T[], offset: number) => Promise<unknown>,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += INSERT_CHUNK) {
    await create(values.slice(offset, offset + INSERT_CHUNK), offset);
  }
}

async function prepareScenario(prisma: PrismaClient, size: number) {
  const fixture = await createBingoFixture(prisma, `draw-benchmark-${size}`);
  const event = await fixture.createEvent(`draw-benchmark-${size}`);
  const configured = await fixture.createConfiguredRound(event.id);
  const cards = new BingoCardGenerator(
    new SeededRandomSource(0xb190_7500 ^ size),
  ).generateUnique(size);
  const ids = Array.from({ length: size }, () => ({
    externalSubjectId: randomUUID(),
    participantId: randomUUID(),
    cardId: randomUUID(),
    assignmentId: randomUUID(),
  }));
  const setupStarted = performance.now();

  await createManyInChunks(ids, (chunk, offset) =>
    prisma.bingoAuthorizedExternalSubject.createMany({
      data: chunk.map((idsForRow, index) => ({
        id: idsForRow.externalSubjectId,
        eventId: event.id,
        kind: "AUTHORIZED_GUEST",
        issuer: "urn:asodef:benchmark",
        keyId: "benchmark-v1",
        subjectRefFingerprint: sha256(
          `${size}:${offset + index}:${idsForRow.externalSubjectId}`,
        ),
        sourceReferenceHash: sha256(`source:${idsForRow.externalSubjectId}`),
        resolvedByUserId: fixture.user.id,
        verifiedAt: new Date(),
        lastVerifiedAt: new Date(),
      })),
    }),
  );
  await createManyInChunks(ids, (chunk) =>
    prisma.bingoParticipant.createMany({
      data: chunk.map((idsForRow) => ({
        id: idsForRow.participantId,
        eventId: event.id,
        kind: "AUTHORIZED_GUEST",
        status: "APPROVED",
        externalSubjectId: idsForRow.externalSubjectId,
        approvedAt: new Date(),
      })),
    }),
  );
  await createManyInChunks(ids, (chunk, offset) =>
    prisma.bingoCard.createMany({
      data: chunk.map((idsForRow, index) => {
        const sourceIndex = offset + index;
        const card = cards[sourceIndex]!;
        return {
          id: idsForRow.cardId,
          eventId: event.id,
          displayNumber: `BENCH-${size}-${sourceIndex + 1}`,
          numbers: [...card.numbers],
          layoutHash: card.layoutHash,
        };
      }),
    }),
  );
  await createManyInChunks(ids, (chunk, offset) =>
    prisma.bingoCardPatternMask.createMany({
      data: chunk.map((idsForRow, index) => {
        const card = cards[offset + index]!;
        const requiredBalls = positionsFromMask(
          configured.patternMask.positionMask,
        ).flatMap((position) => {
          const value = card.numbers[position];
          return value === undefined || value === 0 ? [] : [value];
        });
        const requiredNumbers = toPostgresBit75(ballMask(...requiredBalls));
        return {
          eventId: event.id,
          cardId: idsForRow.cardId,
          patternId: configured.pattern.id,
          patternMaskId: configured.patternMask.id,
          requiredNumbers,
          derivationHash: sha256(
            `${card.layoutHash}:${configured.patternMask.id}:${requiredNumbers}`,
          ),
        };
      }),
    }),
  );
  await createManyInChunks(ids, (chunk) =>
    prisma.bingoCardAssignment.createMany({
      data: chunk.map((idsForRow) => ({
        id: idsForRow.assignmentId,
        eventId: event.id,
        cardId: idsForRow.cardId,
        participantId: idsForRow.participantId,
        actorUserId: fixture.user.id,
        reason: "Reproducible DrawNextBall benchmark",
        requestId: `benchmark-${idsForRow.assignmentId}`,
      })),
    }),
  );
  // Bulk preparation is not complete until PostgreSQL has current planner
  // statistics. Production generation/import workflows must perform the same
  // finalization before an event can be started.
  await prisma.$executeRaw(
    Prisma.sql`ANALYZE bingo_participants, bingo_cards, bingo_card_pattern_masks, bingo_card_assignments`,
  );

  await prisma.bingoEvent.update({
    where: { id: event.id },
    data: { status: "CONFIGURED" },
  });
  const frozenAt = new Date();
  await prisma.bingoEvent.update({
    where: { id: event.id },
    data: {
      status: "PUBLISHED",
      publishedAt: frozenAt,
      configurationLockedAt: frozenAt,
    },
  });
  const execution = await fixture.createExecution(event.id, configured.round.id);
  await prisma.bingoRoundExecution.update({
    where: { id: execution.id },
    data: {
      status: "RUNNING",
      operatorUserId: fixture.user.id,
      startedAt: frozenAt,
    },
  });
  await prisma.bingoRound.update({
    where: { id: configured.round.id },
    data: { status: "IN_PROGRESS" },
  });
  await prisma.bingoEvent.update({
    where: { id: event.id },
    data: { status: "IN_PROGRESS", startedAt: frozenAt },
  });

  return {
    command: {
      eventId: event.id,
      roundId: configured.round.id,
      executionId: execution.id,
    },
    setupMs: rounded(performance.now() - setupStarted),
    userId: fixture.user.id,
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.BINGO_BENCHMARK_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("BINGO_BENCHMARK_DATABASE_URL is required");
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [{ emit: "event", level: "query" }],
  });
  let currentQueryDurationMs = 0;
  let currentQueryEvents: { duration: number; query: string }[] = [];
  prisma.$on("query", (event) => {
    currentQueryDurationMs += event.duration;
    currentQueryEvents.push({ duration: event.duration, query: event.query });
  });
  await prisma.$connect();
  const selector: BallSelector = {
    selectBall: (available) => ({
      ball: available[0]!,
      evidence: {
        evidenceVersion: BINGO_DRAW_EVIDENCE_VERSION,
        fairnessMode: "CRYPTO_RNG",
        algorithmId: "benchmark-lowest-available-v1",
        availableBallCount: available.length,
        availableBallsHash: "0".repeat(64),
        selectedIndex: 0,
      },
    }),
  };
  const service = new DrawNextBallService(
    new BingoTransactionKernel(
      {
        transaction: <T>(
          isolationLevel: Prisma.TransactionIsolationLevel,
          work: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => prisma.$transaction(work, { isolationLevel, maxWait: 30_000, timeout: 60_000 }),
      },
      undefined,
      async () => undefined,
    ),
    new BingoLockManager(),
    new PrismaBingoIdempotencyRepository(),
    new PrismaBingoAuditRepository(),
    new PrismaBingoOutboxRepository(),
    selector,
  );
  const report = {
    methodology: { warmups: WARMUPS, samples: SAMPLES, command: "DrawNextBall" },
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    datasets: [] as unknown[],
  };

  try {
    for (const size of DATASET_SIZES) {
      const scenario = await prepareScenario(prisma, size);
      (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
      const samples: number[] = [];
      const databaseSamples: number[] = [];
      const slowestQueries: { duration: number; query: string }[] = [];
      for (let sample = 0; sample < WARMUPS + SAMPLES; sample += 1) {
        (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
        const context: CommandContext = {
          actor: {
            userId: scenario.userId,
            permissions: new Set(["bingo.operate"]),
          },
          requestId: `benchmark-request-${size}-${sample}`,
          idempotencyKey: `benchmark-idempotency-${size}-${sample}`,
          idempotencyKeyHash: "a".repeat(64),
          requestHash: "b".repeat(64),
          clock: { now: () => new Date() },
        };
        currentQueryDurationMs = 0;
        currentQueryEvents = [];
        const started = performance.now();
        await service.execute(scenario.command, context);
        const elapsed = performance.now() - started;
        if (sample >= WARMUPS) {
          samples.push(elapsed);
          databaseSamples.push(currentQueryDurationMs);
          slowestQueries.push(
            ...currentQueryEvents.sort(
              (left, right) => right.duration - left.duration,
            ).slice(0, 1),
          );
        }
      }
      report.datasets.push({
        size,
        setupMs: scenario.setupMs,
        commandMs: {
          p50: rounded(percentile(samples, 50)),
          p95: rounded(percentile(samples, 95)),
          p99: rounded(percentile(samples, 99)),
          min: rounded(Math.min(...samples)),
          max: rounded(Math.max(...samples)),
        },
        databaseQueryMs: {
          p50: rounded(percentile(databaseSamples, 50)),
          p95: rounded(percentile(databaseSamples, 95)),
          p99: rounded(percentile(databaseSamples, 99)),
        },
        clientAndApplicationMs: {
          p50: rounded(
            percentile(
              samples.map((value, index) => value - databaseSamples[index]!),
              50,
            ),
          ),
          p95: rounded(
            percentile(
              samples.map((value, index) => value - databaseSamples[index]!),
              95,
            ),
          ),
        },
        slowestQueries: slowestQueries
          .sort((left, right) => right.duration - left.duration)
          .slice(0, 3)
          .map((event) => ({
            durationMs: event.duration,
            query: event.query.replace(/\s+/g, " ").trim().slice(0, 180),
          })),
        throughputCardsPerSecondAtP50: Math.round(
          size / (percentile(samples, 50) / 1_000),
        ),
      });
      process.stderr.write(`Completed ${size.toLocaleString()} cards\n`);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
