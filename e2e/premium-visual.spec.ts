import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { loginPrivilegedAdmin } from "./support/admin-auth";
import { disconnectTestActorsClient, ensureTestActor, PRIVILEGED_TEST_EMAIL } from "./support/test-actors";

const ADMIN_EMAIL = PRIVILEGED_TEST_EMAIL;
test.use({ trace: "off" });
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function expectStableViewport(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Página no encontrada|Service Unavailable/i);
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
}

test.describe("premium enterprise visual system", () => {
  test.describe.configure({ mode: "serial" });

  let adminStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    await ensureTestActor(ADMIN_EMAIL, "E2E Premium Visual", "SUPER_ADMIN");
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginPrivilegedAdmin(page, { kind: "recovery", index: 1 });
    adminStorageState = await context.storageState();
    await context.close();
  });
  test.afterAll(async () => disconnectTestActorsClient());

  async function openAuthenticatedPage(
    browser: Browser,
  ): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ storageState: adminStorageState });
    return { context, page: await context.newPage() };
  }

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: public, transactional and admin surfaces remain cohesive`, async ({ browser }, testInfo: TestInfo) => {
      const { context, page } = await openAuthenticatedPage(browser);
      await page.setViewportSize(viewport);
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));

      try {
        await page.goto("/");
        const rejectOptional = page.getByRole("button", { name: "Rechazar opcionales" });
        if (await rejectOptional.isVisible()) await rejectOptional.click();

        for (const route of ["/", "/legal", "/legal/politica-de-privacidad", "/pagos"] as const) {
          await page.goto(route);
          await expectStableViewport(page);
          if (route === "/" || route === "/legal") {
            const surface = route === "/" ? "home" : "legal";
            await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${surface}.png`), fullPage: true });
          }
        }

        await page.goto("/pagos");
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-payments.png`), fullPage: true });

        for (const route of ["/admin", "/admin/crm/empresas", "/admin/legal"] as const) {
          await page.goto(route);
          await expect(page.locator("main#main-content")).toBeVisible();
          await expectStableViewport(page);
        }

        await page.goto("/admin");
        await expect(page.getByRole("heading", { name: "Comercial" })).toBeVisible();
        if (viewport.width < 1024) {
          await expect(page.getByRole("button", { name: "Abrir navegación" })).toBeVisible();
          await expect(page.locator("main#main-content")).toBeInViewport();
        } else {
          await expect(page.getByRole("navigation", { name: "Administración" })).toBeVisible();
        }
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-admin.png`), fullPage: true });

        expect(runtimeErrors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
