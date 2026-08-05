import { Prisma, PrismaClient } from "@prisma/client";
import { COMMUNICATION_TEMPLATE_CATALOG } from "./communication-template-catalog";

/** Idempotent via upsert keyed on the unique `key`. */
export async function seedCommunicationTemplates(client: PrismaClient): Promise<void> {
  for (const entry of COMMUNICATION_TEMPLATE_CATALOG) {
    const body = entry.body as Prisma.InputJsonValue;
    await client.communicationTemplate.upsert({
      where: { key: entry.key },
      update: { channel: entry.channel, kind: entry.kind, subject: entry.subject, body },
      create: { key: entry.key, channel: entry.channel, kind: entry.kind, subject: entry.subject, body },
    });
  }
}
