/**
 * Single source of truth for sitemap.xml and robots.txt content
 * (US-019). Consumed by vite.config.ts's build-time plugin (writes
 * these into dist/) and directly unit-tested here - never duplicate
 * this route list elsewhere.
 */

import { LEGAL_DOCUMENT_CATALOG } from "../legal/legal-catalog";
import { BENEFITS } from "../public-content/benefits";
import { AUDIENCES } from "../public-content/audiences";
import { PUBLIC_ROUTE_LIST } from "../public-content/public-routes";

/** Generated from the same canonical registries that render navigation
 * and pages. Guided intake is intentionally excluded: it is a conversion
 * workflow, not an indexable editorial destination. */
export const PUBLIC_MARKETING_ROUTES = [
  ...PUBLIC_ROUTE_LIST.filter(route => route.path !== "/comenzar").map(route => route.path),
  ...BENEFITS.map(benefit => `/beneficios/${benefit.slug}`),
  ...AUDIENCES.map(audience => `/soluciones/${audience.slug}`),
  ...LEGAL_DOCUMENT_CATALOG.map(document => `/legal/${document.slug}`),
] as const;

/** Explicitly required by the PRD's acceptance criteria, plus the
 * authenticated portal prefixes named there ("any future /admin,
 * /mi-cuenta, /empresa paths" - note the singular "/empresa" is the
 * authenticated company portal, distinct from the public "/empresas"
 * marketing route above). */
const DISALLOWED_PATHS = [
  "/pagos/orden",
  "/pagos/procesar",
  "/pagos/resultado",
  "/pagos/comprobante",
  "/admin",
  "/mi-cuenta",
  "/empresa",
] as const;

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function buildSitemapXml(siteUrl: string): string {
  const base = trimTrailingSlash(siteUrl);
  const urls = PUBLIC_MARKETING_ROUTES.map((route) => {
    const loc = route === "/" ? `${base}/` : `${base}${route}`;
    return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(siteUrl: string): string {
  const base = trimTrailingSlash(siteUrl);
  const disallowLines = DISALLOWED_PATHS.map((path) => `Disallow: ${path}`).join("\n");
  return `User-agent: *\n${disallowLines}\n\nSitemap: ${base}/sitemap.xml\n`;
}
