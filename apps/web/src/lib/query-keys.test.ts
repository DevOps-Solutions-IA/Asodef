import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys factory", () => {
  it("produces a stable, serializable key for the health readiness query", () => {
    expect(queryKeys.health.ready()).toEqual(["health", "ready"]);
  });

  it("returns a new array reference each call but with equal contents (safe for TanStack Query's key comparison)", () => {
    const first = queryKeys.health.ready();
    const second = queryKeys.health.ready();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("produces a stable key for the published content query", () => {
    expect(queryKeys.content.all()).toEqual(["content"]);
  });

  it("scopes Knowledge Admin list and version diff queries", () => {
    expect(queryKeys.admin.knowledge.list({ page: 1 })).toEqual([
      "admin", "knowledge", "list", { page: 1 },
    ]);
    expect(queryKeys.admin.knowledge.diff("version-1")).toEqual([
      "admin", "knowledge", "diff", "version-1",
    ]);
  });
});
