import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const routes = [
  "/",
  "/quienes-somos",
  "/beneficios",
  "/beneficios/movilidad",
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
  "/legal",
  "/legal/politica-de-privacidad",
  "/iniciar-sesion",
];

const viewports = [
  { name: "wide", width: 1440, height: 1000 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "compact", width: 1024, height: 820 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "small", width: 360, height: 800 },
];

const isExpectedAnonymousSessionResponse = (url: string, status: number) =>
  status === 401 && (url.includes("/auth/me") || url.includes("/auth/refresh"));

test.describe("flagship public experience", () => {
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
