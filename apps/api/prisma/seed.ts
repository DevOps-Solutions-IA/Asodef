import { PrismaClient } from "@prisma/client";
import { seedRbac } from "../src/database/seed-rbac";

const prisma = new PrismaClient();

async function main() {
  await seedRbac(prisma);
}

main()
  .catch((error) => {
    console.error("RBAC seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
