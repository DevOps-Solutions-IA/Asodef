import { PrismaClient } from "@prisma/client";
import { RETENTION_POLICY_CATEGORIES } from "./retention-policy-catalog";

export async function seedRetentionPolicies(client: PrismaClient): Promise<void> {
  for (const recordCategory of RETENTION_POLICY_CATEGORIES) {
    await client.retentionPolicy.upsert({
      where: { recordCategory },
      update: {},
      create: { recordCategory },
    });
  }
}
