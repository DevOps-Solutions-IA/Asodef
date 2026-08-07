import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { disconnectTestActorsClient, ensureTestActor, TEST_ACTOR_PASSWORD } from "./support/test-actors";

const ADMIN_EMAIL = "e2e.premium-visual@example.com";
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

async function login(page: Page) {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Correo electrónico", { exact: false }).fill(ADMIN_EMAIL);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(TEST_ACTOR_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/iniciar-sesion/);
}

test.describe("premium enterprise visual system", () => {
  test.beforeAll(async () => ensureTestActor(ADMIN_EMAIL, "E2E Premium Visual", "SUPER_ADMIN"));
  test.afterAll(async () => disconnectTestActorsClient());

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: public, transactional and admin surfaces remain cohesive`, async ({ page }, testInfo: TestInfo) => {
      await page.setViewportSize(viewport);
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));

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

      await login(page);
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
    });
  }
});
