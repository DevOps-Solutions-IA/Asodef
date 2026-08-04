import { PrismaClient } from "@prisma/client";
import { seedRbac } from "../src/database/seed-rbac";
import { seedContent } from "../src/database/seed-content";

const prisma = new PrismaClient();

async function main() {
  await seedRbac(prisma);
  await seedContent(prisma);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
