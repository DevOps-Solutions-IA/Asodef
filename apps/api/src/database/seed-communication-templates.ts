import { Prisma, PrismaClient } from "@prisma/client";
import { COMMUNICATION_TEMPLATE_CATALOG, resolveActiveCommunicationTemplate } from "./communication-template-catalog";

/**
 * Idempotent projection of each active source-controlled version. PostgreSQL
 * stores the active content plus its immutable version/hash metadata; Git and
 * the encrypted NotificationJob snapshot preserve historical definitions.
 */
export async function seedCommunicationTemplates(client: PrismaClient): Promise<void> {
  for (const pointer of COMMUNICATION_TEMPLATE_CATALOG) {
    const entry = resolveActiveCommunicationTemplate(pointer.key);
    const body = {
      ...entry.body,
      version: entry.version,
      contentHash: entry.contentHash,
      requiredVariables: entry.requiredVariables,
      versionStore: "SOURCE_CONTROLLED_APPEND_ONLY",
    } as Prisma.InputJsonValue;
    await client.communicationTemplate.upsert({
      where: { key: entry.key },
      update: { channel: entry.channel, kind: entry.kind, subject: entry.subject, body },
      create: { key: entry.key, channel: entry.channel, kind: entry.kind, subject: entry.subject, body },
    });
  }
}
