import { describe, expect, it } from "vitest";
import { AUDIENCES } from "./audiences";
import { BENEFITS, getBenefit } from "./benefits";
import { LEGACY_REDIRECTS, PUBLIC_ROUTE_LIST } from "./public-routes";

describe("public content registries", () => {
  const prohibitedFiller = /información para decidir con claridad|contenido verificable|experiencia verificable|gestión correcta|ruta clara|canales institucionales|soluciones integrales|acompañamiento integral/i;

  it("keeps routes and canonical metadata unique", () => {
    expect(new Set(PUBLIC_ROUTE_LIST.map(route => route.path)).size).toBe(PUBLIC_ROUTE_LIST.length);
    expect(new Set(PUBLIC_ROUTE_LIST.map(route => route.seo.title)).size).toBe(PUBLIC_ROUTE_LIST.length);
    expect(PUBLIC_ROUTE_LIST.every(route => route.seo.description.length >= 60)).toBe(true);
  });

  it("defines eight sourced benefits with resolvable relations", () => {
    expect(BENEFITS).toHaveLength(8);
    expect(new Set(BENEFITS.map(benefit => benefit.slug)).size).toBe(BENEFITS.length);
    for (const benefit of BENEFITS) {
      expect(benefit.process.length).toBeGreaterThanOrEqual(3);
      expect(benefit.relatedSlugs.every(slug => getBenefit(slug))).toBe(true);
      expect(benefit.sourceBasis).not.toMatch(/pendiente|por definir/i);
    }
  });

  it("defines all four audience journeys and safe legacy redirects", () => {
    expect(AUDIENCES.map(audience => audience.slug)).toEqual(["personas", "afiliados", "empresas", "aliados"]);
    expect(AUDIENCES.find(audience => audience.slug === "afiliados")?.heroActions[0]).toEqual({ label: "Consultar mi afiliación", to: "/mi-cuenta/acceso", primary: true });
    expect(AUDIENCES.find(audience => audience.slug === "empresas")?.heroActions).toEqual([
      { label: "Acceso de empresas", to: "/empresa/acceso", primary: true },
      { label: "Solicitar orientación", to: "/comenzar?perfil=empresa" },
    ]);
    expect(LEGACY_REDIRECTS.every(redirect => String(redirect.from) !== String(redirect.to))).toBe(true);
  });

  it("maps the exequial page to the exact published service channel without inventing eligibility", () => {
    const exequial = getBenefit("plan-exequial-familiar");
    expect(exequial?.verifiedNotice?.channelLabel).toBe("Marcar #523");
    expect(exequial?.verifiedNotice?.channelHref).toBe("tel:%23523");
    expect(exequial?.verifiedNotice?.facts.join(" ")).toMatch(/hasta \$3\.000\.000 sin costo adicional, sujeto/i);
    expect(exequial?.eligibility).toMatch(/no se presenta como universal/i);
    expect(exequial?.audience).toEqual(["afiliados"]);
  });

  it("keeps non-legal registries free from prohibited filler", () => {
    expect(JSON.stringify(AUDIENCES)).not.toMatch(prohibitedFiller);
    expect(JSON.stringify(BENEFITS)).not.toMatch(prohibitedFiller);
    const nonLegalRoutes = PUBLIC_ROUTE_LIST.filter(route => route.path !== "/legal");
    expect(JSON.stringify(nonLegalRoutes)).not.toMatch(prohibitedFiller);
  });
});
