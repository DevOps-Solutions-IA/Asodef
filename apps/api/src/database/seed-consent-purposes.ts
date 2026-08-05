import { PrismaClient } from "@prisma/client";
import { CONSENT_PURPOSE_CATALOG } from "./consent-purpose-catalog";

export async function seedConsentPurposes(client: PrismaClient): Promise<void> {
  for (const entry of CONSENT_PURPOSE_CATALOG) {
    await client.consentPurpose.upsert({
      where: { key: entry.key },
      update: { requiresPolicyVersion: entry.requiresPolicyVersion },
      create: { key: entry.key, requiresPolicyVersion: entry.requiresPolicyVersion },
    });
  }
}
