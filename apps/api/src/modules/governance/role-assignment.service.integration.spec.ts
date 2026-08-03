import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { RoleAssignmentService } from "./role-assignment.service";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { seedRbac } from "../../database/seed-rbac";

describe("RoleAssignmentService (integration, real Postgres)", () => {
  let moduleRef: TestingModule;
  let service: RoleAssignmentService;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, SecurityEventsModule],
      providers: [RoleAssignmentService],
    }).compile();

    service = moduleRef.get(RoleAssignmentService);
    prisma = moduleRef.get(PrismaService);
    await seedRbac(prisma);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
  });

  async function createUser(): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `governance-${randomUUID()}@example.com`, passwordHash: "irrelevant", fullName: "Governance Test User" },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function roleId(name: string): Promise<string> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name } });
    return role.id;
  }

  function superAdminActor(actorId: string) {
    return { actorId, actorRoles: ["SUPER_ADMIN"] };
  }

  describe("assignRole", () => {
    it("assigns a role and records a ROLE_ASSIGNED security event", async () => {
      const actorId = await createUser();
      const targetId = await createUser();

      const result = await service.assignRole(superAdminActor(actorId), targetId, "FINANCE", "onboarding new finance staff");

      expect(result.applied).toBe(true);
      const assignment = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId: targetId, roleId: await roleId("FINANCE") } },
      });
      expect(assignment).not.toBeNull();

      const event = await prisma.securityEvent.findFirst({ where: { userId: actorId, type: "ROLE_ASSIGNED" } });
      expect(event).not.toBeNull();
      expect(event?.metadata).toMatchObject({ targetUserId: targetId, roleName: "FINANCE" });
    });

    it("treats assigning an already-held role as a safe no-op (duplicate assignment rejection)", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      await service.assignRole(superAdminActor(actorId), targetId, "AUDITOR", "first assignment");

      const secondAttempt = await service.assignRole(superAdminActor(actorId), targetId, "AUDITOR", "second attempt");

      expect(secondAttempt.applied).toBe(false);
      expect(secondAttempt.alreadyAssigned).toBe(true);
      const count = await prisma.userRole.count({
        where: { userId: targetId, roleId: await roleId("AUDITOR") },
      });
      expect(count).toBe(1); // never duplicated
    });

    it("does not let two concurrent identical assignments both create a row", async () => {
      const actorId = await createUser();
      const targetId = await createUser();

      const [first, second] = await Promise.allSettled([
        service.assignRole(superAdminActor(actorId), targetId, "COMMERCIAL", "concurrent A"),
        service.assignRole(superAdminActor(actorId), targetId, "COMMERCIAL", "concurrent B"),
      ]);

      expect(first.status).toBe("fulfilled");
      expect(second.status).toBe("fulfilled");
      const count = await prisma.userRole.count({
        where: { userId: targetId, roleId: await roleId("COMMERCIAL") },
      });
      expect(count).toBe(1);
    });

    it("rejects assigning an unknown role name", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      await expect(
        service.assignRole(superAdminActor(actorId), targetId, "NOT_A_REAL_ROLE", "test"),
      ).rejects.toThrow(BadRequestException);
    });

    it("requires a non-empty reason for the governance change", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      await expect(service.assignRole(superAdminActor(actorId), targetId, "AUDITOR", "")).rejects.toThrow(BadRequestException);
      await expect(service.assignRole(superAdminActor(actorId), targetId, "AUDITOR", "   ")).rejects.toThrow(BadRequestException);
    });

    it("rejects a non-SUPER_ADMIN actor and records GOVERNANCE_CHANGE_ATTEMPTED", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      const nonSuperAdminActor = { actorId, actorRoles: ["ADMIN"] };

      await expect(service.assignRole(nonSuperAdminActor, targetId, "FINANCE", "trying anyway")).rejects.toThrow(
        ForbiddenException,
      );

      const event = await prisma.securityEvent.findFirst({
        where: { userId: actorId, type: "GOVERNANCE_CHANGE_ATTEMPTED" },
      });
      expect(event).not.toBeNull();
      expect(event?.metadata).toMatchObject({ action: "assignRole", result: "denied" });
    });

    it("in preview mode, validates but does not persist or record an event", async () => {
      const actorId = await createUser();
      const targetId = await createUser();

      const result = await service.assignRole(superAdminActor(actorId), targetId, "FINANCE", "dry run", { preview: true });

      expect(result.applied).toBe(false);
      const assignment = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId: targetId, roleId: await roleId("FINANCE") } },
      });
      expect(assignment).toBeNull();
      const event = await prisma.securityEvent.findFirst({ where: { userId: actorId, type: "ROLE_ASSIGNED" } });
      expect(event).toBeNull();
    });
  });

  describe("removeRole", () => {
    it("removes a role and records a ROLE_REMOVED security event", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      await service.assignRole(superAdminActor(actorId), targetId, "COMMERCIAL", "setup");

      const result = await service.removeRole(superAdminActor(actorId), targetId, "COMMERCIAL", "no longer needed");

      expect(result.applied).toBe(true);
      const assignment = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId: targetId, roleId: await roleId("COMMERCIAL") } },
      });
      expect(assignment).toBeNull();

      const event = await prisma.securityEvent.findFirst({ where: { userId: actorId, type: "ROLE_REMOVED" } });
      expect(event).not.toBeNull();
      expect(event?.metadata).toMatchObject({ targetUserId: targetId, roleName: "COMMERCIAL" });
    });

    it("is a safe no-op when removing a role the user does not hold", async () => {
      const actorId = await createUser();
      const targetId = await createUser();

      const result = await service.removeRole(superAdminActor(actorId), targetId, "COMMERCIAL", "cleanup");

      expect(result.applied).toBe(false);
      expect(result.alreadyAbsent).toBe(true);
    });

    it("prevents removing the final SUPER_ADMIN from the platform", async () => {
      // Isolate this test's SUPER_ADMIN count by acting via a dedicated
      // actor/target pair and asserting against the *count at the time*,
      // rather than assuming a fixed global count.
      const soleSuperAdminCandidate = await createUser();
      await service.assignRole(
        { actorId: soleSuperAdminCandidate, actorRoles: ["SUPER_ADMIN"] },
        soleSuperAdminCandidate,
        "SUPER_ADMIN",
        "self-seed for isolated test - not a self-removal attempt below",
      );
      const currentSuperAdminCount = await prisma.userRole.count({ where: { role: { name: "SUPER_ADMIN" } } });
      expect(currentSuperAdminCount).toBeGreaterThanOrEqual(1);

      if (currentSuperAdminCount === 1) {
        const otherActorId = await createUser();
        await expect(
          service.removeRole(
            { actorId: otherActorId, actorRoles: ["SUPER_ADMIN"] },
            soleSuperAdminCandidate,
            "SUPER_ADMIN",
            "attempting to remove the last one",
          ),
        ).rejects.toThrow(ConflictException);
      }
    });

    it("prevents an actor from removing their own SUPER_ADMIN role (self-lockout protection)", async () => {
      const actorId = await createUser();
      await service.assignRole(superAdminActor(actorId), actorId, "SUPER_ADMIN", "grant for self-lockout test");

      await expect(
        service.removeRole(superAdminActor(actorId), actorId, "SUPER_ADMIN", "trying to remove my own role"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows removing SUPER_ADMIN from a *different* user when more than one SUPER_ADMIN exists", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      await service.assignRole(superAdminActor(actorId), targetId, "SUPER_ADMIN", "grant for multi-admin test");
      // Now at least two SUPER_ADMINs exist: actorId and targetId.

      const result = await service.removeRole(superAdminActor(actorId), targetId, "SUPER_ADMIN", "demoting - plenty of others remain");

      expect(result.applied).toBe(true);
    });

    it("rejects a non-SUPER_ADMIN actor attempting removeRole", async () => {
      const actorId = await createUser();
      const targetId = await createUser();
      await expect(
        service.removeRole({ actorId, actorRoles: ["FINANCE"] }, targetId, "FINANCE", "unauthorized attempt"),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
