import { ConflictException } from "@nestjs/common";
import { AdminIdentityPolicy } from "../auth/admin-identity.policy";
import { RoleAssignmentService } from "./role-assignment.service";
import type { PrismaService } from "../../database/prisma.service";
import type { SecurityEventService } from "../../common/security-events/security-event.service";

describe("RoleAssignmentService privileged identity boundary", () => {
  function harness(targetEmail: string) {
    const prisma = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: "role-id", name: "SUPER_ADMIN" }) },
      user: { findUnique: jest.fn().mockResolvedValue({ email: targetEmail }) },
    };
    const config = {
      get: jest.fn((key: string) => key === "ADMIN_ACCOUNT_EMAIL" ? "admin@asodef.com.co" : "asodefsas@gmail.com"),
    };
    const policy = new AdminIdentityPolicy(config as never);
    const service = new RoleAssignmentService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as SecurityEventService,
      policy,
    );
    return service;
  }

  it("rejects granting ADMIN/SUPER_ADMIN to a non-official staff identity", async () => {
    const service = harness("staff@asodef.com.co");

    await expect(service.assignRole(
      { actorId: "actor", actorRoles: ["SUPER_ADMIN"] },
      "target",
      "SUPER_ADMIN",
      "privileged assignment",
    )).rejects.toThrow(ConflictException);
  });

  it("rejects removing a privileged role from the official account", async () => {
    const service = harness("admin@asodef.com.co");

    await expect(service.removeRole(
      { actorId: "different-actor", actorRoles: ["SUPER_ADMIN"] },
      "official-target",
      "SUPER_ADMIN",
      "unsafe removal",
    )).rejects.toThrow(ConflictException);
  });
});
