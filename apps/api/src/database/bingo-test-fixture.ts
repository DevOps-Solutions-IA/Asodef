import { createHash, randomUUID } from "node:crypto";
import {
  BingoEligibilityPolicy,
  BingoFairnessMode,
  BingoParticipantKind,
  BingoParticipantStatus,
  BingoTiePolicy,
  BingoValidationPolicy,
  PrismaClient,
} from "@prisma/client";

export const VALID_CARD = [
  1, 16, 31, 46, 61, 2, 17, 32, 47, 62, 3, 18, 0, 48, 63, 4, 19, 34, 49, 64, 5,
  20, 35, 50, 65,
];

export const BIT_75 = "0".repeat(75);

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createBingoFixture(prisma: PrismaClient, label: string) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `bingo-stage3-${label}-${suffix}@example.com`,
      passwordHash: "not-a-real-hash",
      fullName: `Bingo Stage 3 ${label}`,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      documentType: "CC",
      documentNumber: `stage3-${suffix}`,
      fullName: `Bingo Affiliate ${label}`,
      email: `affiliate-${suffix}@example.com`,
      phone: "3000000000",
    },
  });
  const affiliate = await prisma.affiliate.create({
    data: { customerId: customer.id, affiliateNumber: `BINGO-${suffix}` },
  });

  async function createEvent(
    eventLabel: string,
    options: {
      maxCards?: number;
      validationPolicy?: BingoValidationPolicy;
      fairnessMode?: BingoFairnessMode;
    } = {},
  ) {
    return prisma.bingoEvent.create({
      data: {
        slug: `stage3-${eventLabel}-${randomUUID()}`,
        name: `Stage 3 ${eventLabel}`,
        eligibilityPolicy: BingoEligibilityPolicy.COMBINED,
        maxCardsPerParticipant: options.maxCards ?? 1,
        defaultValidationPolicy:
          options.validationPolicy ?? BingoValidationPolicy.SIMPLE,
        fairnessMode: options.fairnessMode ?? BingoFairnessMode.CRYPTO_RNG,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
    });
  }

  async function createAffiliateParticipant(eventId: string) {
    return prisma.bingoParticipant.create({
      data: {
        eventId,
        kind: BingoParticipantKind.AFFILIATE,
        status: BingoParticipantStatus.APPROVED,
        affiliateId: affiliate.id,
        approvedAt: new Date(),
      },
    });
  }

  async function createGuestParticipant(eventId: string) {
    const externalSubject = await prisma.bingoAuthorizedExternalSubject.create({
      data: {
        eventId,
        kind: BingoParticipantKind.AUTHORIZED_GUEST,
        issuer: "urn:asodef:test-authority",
        keyId: "test-v1",
        subjectRefFingerprint: sha256(randomUUID()),
        sourceReferenceHash: sha256(randomUUID()),
        resolvedByUserId: user.id,
        verifiedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });
    const participant = await prisma.bingoParticipant.create({
      data: {
        eventId,
        kind: BingoParticipantKind.AUTHORIZED_GUEST,
        status: BingoParticipantStatus.APPROVED,
        externalSubjectId: externalSubject.id,
        approvedAt: new Date(),
      },
    });
    return { externalSubject, participant };
  }

  async function createConfiguredRound(
    eventId: string,
    options: {
      sequence?: number;
      validationPolicy?: BingoValidationPolicy;
      tiePolicy?: BingoTiePolicy;
    } = {},
  ) {
    const sequence = options.sequence ?? 1;
    const validationPolicy =
      options.validationPolicy ?? BingoValidationPolicy.SIMPLE;
    const tiePolicy = options.tiePolicy ?? BingoTiePolicy.SPLIT_PRIZE;
    const round = await prisma.bingoRound.create({
      data: {
        eventId,
        sequence,
        name: `Round ${sequence}`,
        validationPolicy,
        tiePolicy,
        createdByUserId: user.id,
      },
    });
    const prize = await prisma.bingoPrize.create({
      data: {
        eventId,
        roundId: round.id,
        sequence: 1,
        name: "Stage 3 prize",
        kind: "IN_KIND",
      },
    });
    const pattern = await prisma.bingoPattern.create({
      data: {
        eventId,
        code: `line-${sequence}`,
        name: "Line",
        kind: "LINE",
      },
    });
    const patternMask = await prisma.bingoPatternMask.create({
      data: { eventId, patternId: pattern.id, sequence: 1, positionMask: 31 },
    });
    const roundPattern = await prisma.bingoRoundPattern.create({
      data: { eventId, roundId: round.id, patternId: pattern.id, sequence: 1 },
    });
    const lockedAt = new Date();
    const lockedRound = await prisma.bingoRound.update({
      where: { id: round.id },
      data: { status: "READY", configurationLockedAt: lockedAt },
    });
    return { round: lockedRound, prize, pattern, patternMask, roundPattern };
  }

  async function createExecution(
    eventId: string,
    roundId: string,
    options: {
      revision?: number;
      previousExecutionId?: string;
      validationPolicy?: BingoValidationPolicy;
      tiePolicy?: BingoTiePolicy;
      fairnessMode?: BingoFairnessMode;
      configurationHash?: string;
      fairnessProtocolVersion?: string;
    } = {},
  ) {
    return prisma.bingoRoundExecution.create({
      data: {
        eventId,
        roundId,
        revision: options.revision ?? 1,
        previousExecutionId: options.previousExecutionId,
        validationPolicySnapshot:
          options.validationPolicy ?? BingoValidationPolicy.SIMPLE,
        tiePolicySnapshot: options.tiePolicy ?? BingoTiePolicy.SPLIT_PRIZE,
        fairnessModeSnapshot:
          options.fairnessMode ?? BingoFairnessMode.CRYPTO_RNG,
        configurationVersion: 1,
        configurationHash:
          options.configurationHash ?? sha256(`${eventId}:${roundId}:v1`),
        fairnessProtocolVersion:
          options.fairnessProtocolVersion ?? "asodef-bingo-crypto-rng-v1",
        createdByUserId: user.id,
      },
    });
  }

  async function createCard(
    eventId: string,
    displayNumber: string = randomUUID(),
  ) {
    return prisma.bingoCard.create({
      data: {
        eventId,
        displayNumber,
        numbers: VALID_CARD,
        layoutHash: sha256(`${eventId}:${displayNumber}`),
      },
    });
  }

  async function assignCard(
    eventId: string,
    cardId: string,
    participantId: string,
  ) {
    return prisma.bingoCardAssignment.create({
      data: {
        eventId,
        cardId,
        participantId,
        actorUserId: user.id,
        reason: "Stage 3 persistence test",
        requestId: randomUUID(),
      },
    });
  }

  return {
    user,
    customer,
    affiliate,
    createEvent,
    createAffiliateParticipant,
    createGuestParticipant,
    createConfiguredRound,
    createExecution,
    createCard,
    assignCard,
  };
}
