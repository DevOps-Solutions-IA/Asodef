import { randomUUID } from "node:crypto";
import { ConversationChannel, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import type { IdentityAssuranceLevel, ResolvedIdentityContext } from "./contracts/identity-resolution.contract";
import { ConversationIdentityBindingService } from "./conversation-identity-binding.service";

describe("conversation identity binding (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  let service: ConversationIdentityBindingService;
  const conversationIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    service = new ConversationIdentityBindingService(prisma as never);
  });

  afterEach(async () => {
    const where = { conversationId: { in: conversationIds } };
    await prisma.conversationEvent.deleteMany({ where });
    await prisma.conversationIdentityBinding.deleteMany({ where });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    conversationIds.length = 0;
  });

  afterAll(async () => prisma.$disconnect());

  async function conversation() {
    const row = await prisma.conversation.create({ data: {} });
    conversationIds.push(row.id);
    return row;
  }

  function identity(level: IdentityAssuranceLevel, identityId = "identity-1"): ResolvedIdentityContext {
    const authenticated = ["AUTHENTICATED", "MFA_VERIFIED", "STEP_UP_VERIFIED"].includes(level);
    return {
      version: "1.0.0",
      identityId,
      channelIdentities: [{ channel: ConversationChannel.WEB, externalIdentityId: "visitor-1", verified: level !== "ANONYMOUS" }],
      assuranceLevel: level,
      authenticationEvidence: {
        authenticated,
        mfaVerified: level === "MFA_VERIFIED" || level === "STEP_UP_VERIFIED",
        stepUpVerified: level === "STEP_UP_VERIFIED",
      },
      consentState: { status: "UNKNOWN", purposeKeys: [] },
      verifiedAttributes: [],
    };
  }

  function input(conversationId: string, level: IdentityAssuranceLevel, key = randomUUID(), identityId?: string) {
    return {
      conversationId,
      identity: identity(level, identityId),
      reason: `EVIDENCE_${level}`,
      evidenceReference: `evidence:${level.toLowerCase()}`,
      correlationId: randomUUID(),
      idempotencyKey: key,
    };
  }

  it("appends anonymous to claimed to verified history without overwriting evidence", async () => {
    const row = await conversation();
    await service.bind(input(row.id, "ANONYMOUS", randomUUID(), "anonymous-1"));
    await service.bind(input(row.id, "CLAIMED"));
    await service.bind(input(row.id, "VERIFIED"));
    const history = await prisma.conversationIdentityBinding.findMany({ where: { conversationId: row.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((entry) => [entry.previousAssurance, entry.newAssurance])).toEqual([
      [null, "ANONYMOUS"],
      ["ANONYMOUS", "CLAIMED"],
      ["CLAIMED", "VERIFIED"],
    ]);
    expect(await prisma.conversationEvent.count({ where: { conversationId: row.id, eventType: "IDENTITY_ASSURANCE_CHANGED" } })).toBe(3);
  });

  it("accepts explicit authenticated and MFA evidence and rejects manufactured upgrades", async () => {
    const row = await conversation();
    await service.bind(input(row.id, "AUTHENTICATED"));
    await service.bind(input(row.id, "MFA_VERIFIED"));
    const invalid = identity("MFA_VERIFIED");
    invalid.authenticationEvidence.mfaVerified = false;
    await expect(service.bind({ ...input(row.id, "MFA_VERIFIED"), identity: invalid })).rejects.toThrow("INSUFFICIENT_AUTHENTICATION_EVIDENCE");
  });

  it("is concurrency-safe and rejects downgrade or conflicting established identity", async () => {
    const row = await conversation();
    const key = randomUUID();
    const [first, replay] = await Promise.all([service.bind(input(row.id, "MATCHED", key)), service.bind(input(row.id, "MATCHED", key))]);
    expect([first.replayed, replay.replayed].sort()).toEqual([false, true]);
    await expect(service.bind(input(row.id, "CLAIMED"))).rejects.toThrow("ASSURANCE_DOWNGRADE_REJECTED");
    await expect(service.bind(input(row.id, "VERIFIED", randomUUID(), "different-identity"))).rejects.toThrow("IDENTITY_CONFLICT");
    expect(await prisma.conversationIdentityBinding.count({ where: { conversationId: row.id } })).toBe(1);
  });

  it("retains historical assurance while exposing lower live request assurance after expiry", async () => {
    const row = await conversation();
    await service.bind(input(row.id, "STEP_UP_VERIFIED", randomUUID(), "portal-user:user-1"));
    const effectiveKey = randomUUID();
    const effectiveInput = input(row.id, "ANONYMOUS", effectiveKey, "anonymous-reconnect");
    const effective = await service.bindEffective(effectiveInput);
    const replay = await service.bindEffective(effectiveInput);

    expect(effective).toMatchObject({
      historicalAssuranceRetained: true,
      effectiveIdentity: { assuranceLevel: "ANONYMOUS" },
      binding: { newAssurance: "STEP_UP_VERIFIED" },
    });
    expect(await prisma.conversationIdentityBinding.count({ where: { conversationId: row.id } })).toBe(1);
    expect(replay).toMatchObject({ replayed: true, historicalAssuranceRetained: true });
    expect(await prisma.conversationEvent.count({
      where: { conversationId: row.id, eventType: "IDENTITY_EFFECTIVE_ASSURANCE_REDUCED" },
    })).toBe(1);
    await expect(service.bindEffective(
      input(row.id, "AUTHENTICATED", randomUUID(), "portal-user:different-user"),
    )).rejects.toThrow("IDENTITY_CONFLICT");
  });
});
