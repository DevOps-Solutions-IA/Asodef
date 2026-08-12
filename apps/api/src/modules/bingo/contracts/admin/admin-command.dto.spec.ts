import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  BingoPatternMaskDto,
  CreateBingoEventDto,
  CreateBingoPatternDto,
  RegisterBingoParticipantDto,
} from "./admin-command.dto";
import { BINGO_ADMIN_ROUTE_CONTRACTS } from "./admin-route-contract";

async function errors<T extends object>(type: new () => T, body: unknown) {
  return validate(plainToInstance(type, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe("Bingo admin API contracts", () => {
  it("accepts a complete, bounded event command", async () => {
    await expect(
      errors(CreateBingoEventDto, {
        slug: "bingo-asodef-2026",
        name: "Bingo ASODEF 2026",
        visibility: "PUBLIC",
        eligibilityPolicy: "AFFILIATES",
        maxCardsPerParticipant: 3,
        publicWinnerVisibility: "CARD_ONLY",
        validationPolicy: "DUAL_CONTROL",
        fairnessMode: "CRYPTO_RNG",
        startsAt: "2026-12-01T20:00:00.000Z",
      }),
    ).resolves.toHaveLength(0);
  });

  it("rejects mass-assigned event lifecycle and actor fields", async () => {
    const result = await errors(CreateBingoEventDto, {
      slug: "safe-event",
      name: "Safe",
      visibility: "PUBLIC",
      eligibilityPolicy: "AFFILIATES",
      maxCardsPerParticipant: 1,
      publicWinnerVisibility: "CARD_ONLY",
      validationPolicy: "SIMPLE",
      fairnessMode: "CRYPTO_RNG",
      startsAt: "2026-12-01T20:00:00.000Z",
      status: "IN_PROGRESS",
      actorUserId: "attacker",
    });
    expect(result.map(({ property }) => property)).toEqual(
      expect.arrayContaining(["status", "actorUserId"]),
    );
  });

  it("rejects malformed and oversized custom masks", async () => {
    const result = await errors(CreateBingoPatternDto, {
      name: "Injected",
      kind: "CUSTOM",
      masks: [{ positions: [0, 25] }],
    });
    expect(result).not.toHaveLength(0);
    expect(
      plainToInstance(BingoPatternMaskDto, { positions: [0, 12, 24] }),
    ).toBeInstanceOf(BingoPatternMaskDto);
  });

  it("does not accept identity lookup by PII", async () => {
    const result = await errors(RegisterBingoParticipantDto, {
      kind: "AFFILIATE",
      documentNumber: "123456789",
      phone: "3000000000",
    });
    expect(result.map(({ property }) => property)).toEqual(
      expect.arrayContaining(["documentNumber", "phone"]),
    );
  });

  it("enforces a single referentially meaningful participant identity shape", async () => {
    await expect(
      errors(RegisterBingoParticipantDto, {
        kind: "AFFILIATE",
        affiliateId: "9f9f60cb-92b4-4d76-a9cf-b60dfe6613fa",
      }),
    ).resolves.toHaveLength(0);
    await expect(
      errors(RegisterBingoParticipantDto, {
        kind: "AFFILIATE",
        affiliateId: "9f9f60cb-92b4-4d76-a9cf-b60dfe6613fa",
        authorizedSubjectRef: "ambiguous",
      }),
    ).resolves.not.toHaveLength(0);
    await expect(
      errors(RegisterBingoParticipantDto, {
        kind: "PARTNER_COMPANY_MEMBER",
        companyId: "9f9f60cb-92b4-4d76-a9cf-b60dfe6613fa",
      }),
    ).resolves.not.toHaveLength(0);
  });

  it("requires idempotency on every declared mutation and maps concrete RBAC permissions", () => {
    for (const route of BINGO_ADMIN_ROUTE_CONTRACTS) {
      expect(route.permission).toMatch(/^bingo\./);
      expect(
        route.mutation
          ? route.requiresIdempotencyKey
          : !route.requiresIdempotencyKey,
      ).toBe(true);
    }
  });
});
