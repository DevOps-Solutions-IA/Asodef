import { PrismaClient } from "@prisma/client";
import { seedRbac } from "../src/database/seed-rbac";
import { seedContent } from "../src/database/seed-content";
import { seedPayments } from "../src/database/seed-payments";
import { seedLegalDocuments } from "../src/database/seed-legal-documents";
import { seedConsentPurposes } from "../src/database/seed-consent-purposes";

const prisma = new PrismaClient();

async function main() {
  await seedRbac(prisma);
  await seedContent(prisma);
  await seedPayments(prisma);
  await seedLegalDocuments(prisma);
  await seedConsentPurposes(prisma);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
