import { describe, expect, it } from "vitest";
import { AUDIENCES } from "./audiences";
import { BENEFITS, getBenefit } from "./benefits";
import { LEGACY_REDIRECTS, PUBLIC_ROUTE_LIST } from "./public-routes";

describe("public content registries", () => {
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
    expect(LEGACY_REDIRECTS.every(redirect => String(redirect.from) !== String(redirect.to))).toBe(true);
  });
});
