import { describe, expect, it } from "vitest";
import { isSafeInternalPath } from "./safe-redirect";

describe("isSafeInternalPath", () => {
  it("accepts a normal internal path", () => {
    expect(isSafeInternalPath("/mi-cuenta/perfil")).toBe(true);
    expect(isSafeInternalPath("/admin")).toBe(true);
  });

  it("rejects a protocol-relative path (the classic open-redirect trick)", () => {
    expect(isSafeInternalPath("//evil.example.com")).toBe(false);
  });

  it("rejects backslash and encoded-separator normalization bypasses", () => {
    expect(isSafeInternalPath("/\\evil.example.com")).toBe(false);
    expect(isSafeInternalPath("/%5cevil.example.com")).toBe(false);
    expect(isSafeInternalPath("/%5C%5Cevil.example.com")).toBe(false);
    expect(isSafeInternalPath("/%255cevil.example.com")).toBe(false);
  });

  it("rejects an absolute external URL", () => {
    expect(isSafeInternalPath("https://evil.example.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.example.com/mi-cuenta")).toBe(false);
  });

  it("rejects a javascript: pseudo-URL", () => {
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects anything containing :// even if it doesn't start with it", () => {
    expect(isSafeInternalPath("/redirect?to=https://evil.example.com")).toBe(false);
  });

  it("rejects non-string values (undefined, null, objects, numbers)", () => {
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
    expect(isSafeInternalPath({ pathname: "/admin" })).toBe(false);
  });

  it("rejects an empty string and a path with no leading slash", () => {
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath("mi-cuenta")).toBe(false);
  });

  it("rejects malformed escapes, control characters and unbounded paths", () => {
    expect(isSafeInternalPath("/%not-encoded")).toBe(false);
    expect(isSafeInternalPath("/admin\nnext")).toBe(false);
    expect(isSafeInternalPath(`/${"a".repeat(2_049)}`)).toBe(false);
  });
});
