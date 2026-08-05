import { PrismaClient } from "@prisma/client";
import { APPROVAL_GATE_CATALOG } from "./approval-gate-catalog";

/**
 * US-058: seeds all 16 catalog gates, each starting PENDING. Idempotent
 * via upsert keyed on the unique `key` - never resets an already-
 * transitioned gate's status/approver/date back to PENDING on a
 * re-seed (`update` only refreshes the description text, matching
 * seed-content.ts's own precedent for already-real data).
 */
export async function seedApprovalGates(client: PrismaClient): Promise<void> {
  for (const entry of APPROVAL_GATE_CATALOG) {
    await client.approvalGate.upsert({
      where: { key: entry.key },
      update: { description: entry.description },
      create: { key: entry.key, description: entry.description },
    });
  }
}
