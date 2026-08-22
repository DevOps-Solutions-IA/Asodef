import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { loginPrivilegedAdmin } from "./support/admin-auth";
import { PRIVILEGED_TEST_EMAIL, disconnectTestActorsClient, ensureTestActor } from "./support/test-actors";

test.use({ trace: "off" });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
] as const;

test.describe("admin information architecture", () => {
  test.describe.configure({ mode: "serial" });

  let adminStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    await ensureTestActor(PRIVILEGED_TEST_EMAIL, "E2E Information Architecture Administrator", "SUPER_ADMIN");
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginPrivilegedAdmin(page, { kind: "recovery", index: 6 });
    adminStorageState = await context.storageState();
    await context.close();
  });

  test.afterAll(async () => disconnectTestActorsClient());

  async function openAuthenticatedPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ storageState: adminStorageState });
    return { context, page: await context.newPage() };
  }

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: business Dashboard, System and Mi cuenta remain reachable and responsive`, async ({ browser }) => {
      const { context, page } = await openAuthenticatedPage(browser);
      await page.setViewportSize(viewport);
      try {
        await page.goto("/admin");
        await expect(page.getByRole("heading", { name: "Dashboard administrativo" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Resumen ejecutivo" })).toBeVisible();
        for (const technicalLabel of ["PostgreSQL", "Redis", "Master / Firebird", "Release SHA", "Migración"]) {
          await expect(page.getByText(technicalLabel, { exact: true })).toHaveCount(0);
        }

        if (viewport.name === "desktop") {
          const nav = page.getByRole("navigation", { name: "Administración" });
          for (const group of ["Gestión", "Operación", "Cumplimiento", "Inteligencia", "Administración"]) await expect(nav.getByRole("heading", { name: group })).toBeVisible();
        } else {
          await page.getByRole("button", { name: "Abrir navegación" }).click();
          await expect(page.getByRole("navigation", { name: "Administración" }).last()).toBeVisible();
          await page.keyboard.press("Escape");
        }

        await page.getByRole("button", { name: "Abrir menú de Mi cuenta" }).click();
        await expect(page.getByRole("link", { name: "Mi cuenta" })).toBeVisible();
        await page.getByRole("link", { name: "Mi cuenta" }).click();
        await expect(page).toHaveURL(/\/admin\/mi-cuenta\/seguridad$/);
        await expect(page.getByRole("heading", { name: "Seguridad de mi cuenta" })).toBeVisible();

        await page.goto("/admin/sistema");
        await expect(page.getByRole("heading", { name: "Sistema" })).toBeVisible();
        await page.getByRole("button", { name: "Integraciones" }).click();
        await expect(page.getByRole("heading", { name: "Integraciones externas" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Master / Firebird" })).toBeVisible();

        await page.goto("/admin/usuarios");
        await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
        await page.goto("/admin/auditoria");
        await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }

  test("legacy personal-security URLs redirect to the canonical Mi cuenta routes", async ({ browser }) => {
    const { context, page } = await openAuthenticatedPage(browser);
    try {
      await page.goto("/admin/seguridad");
      await expect(page).toHaveURL(/\/admin\/mi-cuenta\/seguridad$/);
      await page.goto("/admin/sesiones");
      await expect(page).toHaveURL(/\/admin\/mi-cuenta\/sesiones$/);
    } finally {
      await context.close();
    }
  });
});
