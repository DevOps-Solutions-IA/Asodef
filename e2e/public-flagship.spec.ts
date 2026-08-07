import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const routes = [
  "/",
  "/quienes-somos",
  "/beneficios",
  "/beneficios/plan-exequial-familiar",
  "/beneficios/seguro-de-vida",
  "/beneficios/asesoria-juridica",
  "/beneficios/movilidad",
  "/beneficios/salud-y-bienestar",
  "/beneficios/educacion",
  "/beneficios/convenios-comerciales",
  "/beneficios/categorias-complementarias",
  "/soluciones",
  "/soluciones/personas",
  "/soluciones/afiliados",
  "/soluciones/empresas",
  "/soluciones/aliados",
  "/empresas",
  "/recursos",
  "/recursos/preguntas-frecuentes",
  "/contacto",
  "/comenzar",
  "/pagos",
  "/pqr",
  "/solicitudes-de-datos",
  "/legal",
  "/legal/politica-de-privacidad",
  "/login",
  "/iniciar-sesion",
  "/ruta-publica-no-existente",
];

const viewports = [
  { name: "wide", width: 1440, height: 1000 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "compact", width: 1024, height: 820 },
  { name: "tablet", width: 768, height: 900 },
  { name: "large-mobile", width: 430, height: 932 },
  { name: "mobile", width: 390, height: 844 },
  { name: "compact-mobile", width: 375, height: 812 },
  { name: "small", width: 360, height: 800 },
  { name: "minimum", width: 320, height: 720 },
];

const isExpectedAnonymousSessionResponse = (url: string, status: number) =>
  status === 401 && (url.includes("/auth/me") || url.includes("/auth/refresh"));

test.describe("flagship public experience", () => {
  test("mobile home and drawer expose one deliberate action hierarchy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByText("Personas · afiliados · empresas · aliados")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Beneficios, pagos y solicitudes");
    await expect(page.getByRole("link", { name: "Recibir orientación" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Consultar beneficios" }).first()).toBeVisible();

    const quickActions = page.getByRole("navigation", { name: "Acciones rápidas" });
    await expect(quickActions.getByRole("link")).toHaveCount(5);
    await expect(quickActions.getByRole("link")).toHaveText(["Pagar", "Radicar PQR", "Consultar caso", "Solicitudes de datos", "Ingresar"]);
    await expect(quickActions.getByRole("link", { name: /Consultar beneficios|Recibir orientación/ })).toHaveCount(0);

    const openMenu = page.getByRole("button", { name: "Abrir menú de navegación" });
    await openMenu.click();
    const drawer = page.getByRole("dialog", { name: "Navegación" });
    await expect(drawer.getByRole("button", { name: "Cerrar" })).toHaveCount(1);
    const resources = drawer.getByRole("navigation", { name: "Principal móvil" });
    await expect(resources.getByText("Recursos", { exact: true })).toBeVisible();
    await expect(resources.getByRole("link", { name: "PQR" })).toBeVisible();
    await expect(resources.getByRole("link", { name: "Solicitudes de datos" })).toBeVisible();
    await expect(resources.getByRole("link", { name: "Contacto" })).toHaveCount(0);
    const drawerActions = drawer.locator('[aria-label="Acciones principales"] a');
    await expect(drawerActions).toHaveText(["Pagar", "Ingresar", "Recibir orientación"]);
    await drawer.getByRole("button", { name: "Cerrar" }).click();
    await expect(openMenu).toBeFocused();
  });

  test("mobile benefits keep compact filters and ordered detail actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/beneficios");
    const filters = page.getByRole("region", { name: "Filtra por perfil y necesidad" });
    const profileFilter = filters.getByRole("combobox", { name: /Perfil/ });
    const needFilter = filters.getByRole("combobox", { name: /Necesidad/ });
    await expect(profileFilter).toHaveCSS("min-height", "48px");
    await expect(needFilter).toHaveCSS("min-height", "48px");
    await profileFilter.selectOption("afiliados");
    await expect(page).toHaveURL(/audiencia=afiliados/);
    await expect(page.getByText(/categorías encontradas|categoría encontrada/)).toBeVisible();

    await page.goto("/beneficios/plan-exequial-familiar");
    const heroActions = page.locator("main section").first().getByRole("link");
    await expect(heroActions.first()).toHaveText("Encontrar mi ruta");
    await expect(heroActions.nth(1)).toHaveText("Volver al portafolio");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });

  test("verified counter resolves immediately when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const indicators = page.getByRole("region", { name: "Información institucional verificada" });
    await expect(indicators.locator('[aria-hidden="true"]', { hasText: "13" })).toBeVisible();
    await expect(indicators).not.toContainText("categorías de beneficios");
    await expect(indicators).not.toContainText("documentos institucionales publicados");
  });

  for (const viewport of viewports) {
    test(`${viewport.name}: routes are visible without horizontal overflow`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const unexpectedResponses: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("status of 401 (Unauthorized)")) {
          consoleErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400 && !isExpectedAnonymousSessionResponse(response.url(), response.status())) {
          unexpectedResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        if (route.startsWith("/legal")) {
          await expect(page.getByText("Información institucional")).toBeVisible();
        } else if (viewport.width >= 1024) {
          await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
        } else {
          await expect(page.getByRole("button", { name: "Abrir menú de navegación" })).toBeVisible();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          ),
          route,
        ).toBe(true);
      }

      await page.goto("/");
      await page.screenshot({ path: testInfo.outputPath(`home-${viewport.name}.png`), fullPage: true });
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(unexpectedResponses).toEqual([]);
    });
  }

  test("direct guided branches hand off without collecting duplicate leads", async ({ page }) => {
    for (const branch of [{name:/Pago Necesito/i,to:"/pagos",action:/Ir al Centro de pagos/i},{name:/PQR Quiero/i,to:"/pqr",action:/Radicar una PQR/i},{name:/Datos personales Quiero/i,to:"/solicitudes-de-datos",action:/Iniciar solicitud de datos/i}]) {
      await page.goto("/comenzar"); await page.getByRole("radio",{name:branch.name}).click(); await page.getByRole("button",{name:"Continuar"}).click();
      await expect(page.getByRole("link",{name:branch.action})).toHaveAttribute("href",branch.to);
    }
  });

  test("company journey creates real CRM and versioned consent evidence", async ({ page }) => {
    const prisma=new PrismaClient(); const email=`flagship-${Date.now()}@example.com`;
    try {
      await page.goto("/comenzar?perfil=empresa&utm_source=e2e&utm_campaign=flagship");
      await page.getByPlaceholder(/conocer una categoría/i).fill("Orientación empresarial de prueba E2E"); await page.getByRole("button",{name:"Continuar"}).click();
      await page.getByLabel("Nombre completo").fill("Representante E2E"); await page.getByLabel("Correo electrónico").fill(email); await page.getByLabel("Empresa").fill("Empresa E2E"); await page.getByRole("button",{name:"Continuar"}).click();
      await page.getByRole("radio",{name:"Correo"}).click(); await page.getByText("Acepto recibir la respuesta por correo electrónico.").click(); await page.getByRole("button",{name:"Continuar"}).click();
      await page.getByText(/Autorizo el tratamiento necesario/i).click(); await page.getByRole("button",{name:"Continuar"}).click(); await page.getByRole("button",{name:"Confirmar y enviar"}).click();
      await expect(page.getByRole("heading",{name:"Solicitud registrada"})).toBeVisible(); await expect(page.getByText(/^ASO-/)).toBeVisible();
      await expect.poll(()=>prisma.leadSubmission.findFirst({where:{email}})).not.toBeNull();
      const persisted=await prisma.leadSubmission.findFirstOrThrow({where:{email}}); expect(persisted.campaign).toMatchObject({utmSource:"e2e",utmCampaign:"flagship"});
      expect(await prisma.consentRecord.count({where:{leadSubmissionId:persisted.id}})).toBeGreaterThanOrEqual(2);
    } finally {
      const leads=await prisma.leadSubmission.findMany({where:{email},select:{id:true}}); await prisma.consentRecord.deleteMany({where:{leadSubmissionId:{in:leads.map(item=>item.id)}}}); await prisma.leadSubmission.deleteMany({where:{email}}); await prisma.$disconnect();
    }
  });
});
