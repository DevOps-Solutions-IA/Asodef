import { describe, expect, it } from "vitest";
import { buildRobotsTxt, buildSitemapXml, PUBLIC_MARKETING_ROUTES } from "./seo-files";

const SITE_URL = "https://example-test.invalid";

describe("buildSitemapXml", () => {
  it("lists every public marketing route with an absolute <loc>", () => {
    const xml = buildSitemapXml(SITE_URL);
    for (const route of PUBLIC_MARKETING_ROUTES) {
      const expectedLoc = route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}`;
      expect(xml).toContain(`<loc>${expectedLoc}</loc>`);
    }
  });

  it("never lists a transactional payment step", () => {
    const xml = buildSitemapXml(SITE_URL);
    expect(xml).not.toContain("/pagos/orden");
    expect(xml).not.toContain("/pagos/procesar");
    expect(xml).not.toContain("/pagos/resultado");
    expect(xml).not.toContain("/pagos/comprobante");
  });

  it("never lists an authenticated portal route", () => {
    const xml = buildSitemapXml(SITE_URL);
    expect(xml).not.toContain("/admin");
    expect(xml).not.toContain("/mi-cuenta");
    expect(xml).not.toMatch(/<loc>[^<]*\/empresa</);
  });

  it("normalizes a trailing slash on the site URL", () => {
    const xml = buildSitemapXml(`${SITE_URL}/`);
    expect(xml).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(xml).not.toContain(`${SITE_URL}//`);
  });

  it("produces well-formed XML", () => {
    const xml = buildSitemapXml(SITE_URL);
    expect(xml.trim().startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });
});

describe("buildRobotsTxt", () => {
  it("disallows every path required by the acceptance criteria", () => {
    const robots = buildRobotsTxt(SITE_URL);
    for (const path of ["/pagos/orden", "/pagos/procesar", "/pagos/resultado", "/pagos/comprobante", "/admin", "/mi-cuenta", "/empresa"]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
  });

  it("confirms /pagos/comprobante/:publicReference is disallowed (negative case)", () => {
    const robots = buildRobotsTxt(SITE_URL);
    expect(robots).toContain("Disallow: /pagos/comprobante");
  });

  it("does not disallow public marketing routes", () => {
    const robots = buildRobotsTxt(SITE_URL);
    for (const route of PUBLIC_MARKETING_ROUTES) {
      if (route === "/") continue;
      expect(robots).not.toContain(`Disallow: ${route}\n`);
    }
  });

  it("points to the sitemap at the given site URL", () => {
    const robots = buildRobotsTxt(SITE_URL);
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});
