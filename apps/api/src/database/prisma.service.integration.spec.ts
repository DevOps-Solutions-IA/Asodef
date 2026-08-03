import { Test } from "@nestjs/testing";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";

describe("PrismaService (integration, real Postgres via NestJS DI)", () => {
  let prisma: PrismaService;
  let closeApp: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    closeApp = () => app.close();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await closeApp();
  });

  it("connects on module init and reports the database as healthy", async () => {
    expect(await prisma.isDatabaseHealthy()).toBe(true);
  });

  it("runs a real query through the generated client and sees the seeded roles", async () => {
    const roleCount = await prisma.role.count();
    expect(roleCount).toBeGreaterThanOrEqual(9);

    const superAdmin = await prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } });
    expect(superAdmin?.name).toBe("SUPER_ADMIN");
  });
});
