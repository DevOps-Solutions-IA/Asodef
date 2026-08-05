import type { PrismaClient } from "@prisma/client";
import { APPROVAL_GATE_CATALOG } from "../../database/approval-gate-catalog";

/**
 * US-058 AC, verbatim: "returns true only when every ApprovalGate.status
 * =APPROVED and none is expired". Shared by BoldTransportProvider's
 * factory (startup-time check) and ApprovalGatesService (the runtime-
 * queryable version the AC's own method name refers to) - one
 * canonical implementation, not duplicated.
 */
export async function isProductionPaymentsEnabled(prisma: Pick<PrismaClient, "approvalGate">): Promise<boolean> {
  const gates = await prisma.approvalGate.findMany();

  if (gates.length < APPROVAL_GATE_CATALOG.length) {
    // Not all catalog gates have been seeded yet - never treat missing
    // rows as implicitly approved.
    return false;
  }

  const now = new Date();
  return gates.every((gate) => gate.status === "APPROVED" && (gate.expirationDate === null || gate.expirationDate > now));
}
