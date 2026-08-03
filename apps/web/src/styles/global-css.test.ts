import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = fileURLToPath(new URL("../index.css", import.meta.url));
const css = readFileSync(cssPath, "utf-8");

describe("global CSS baseline (src/index.css)", () => {
  it("declares every ASODEF color token as a CSS custom property", () => {
    const requiredTokens = [
      "--color-brand-dark: #064d38",
      "--color-brand-deep: #003f2d",
      "--color-brand-green: #438b34",
      "--color-brand-light: #80ae3a",
      "--color-brand-orange: #f28a00",
      "--color-brand-orange-light: #ffaa28",
      "--color-bg-base: #f4f5f1",
      "--color-bg-soft: #edf3ec",
      "--color-bg-elevated: #ffffff",
      "--color-text-main: #14201b",
      "--color-text-muted: #66736d",
      "--color-success: #178a52",
      "--color-warning: #d98500",
      "--color-danger: #c83f49",
      "--color-info: #2878b5",
    ];
    for (const token of requiredTokens) {
      expect(css).toContain(token);
    }
  });

  it("sets smooth scrolling on the html element", () => {
    expect(css).toMatch(/html\s*{\s*scroll-behavior:\s*smooth;/);
  });

  it("styles text selection with the orange brand accent", () => {
    expect(css).toMatch(/::selection\s*{\s*background:\s*var\(--color-brand-orange\);/);
  });

  it("defines a custom, non-default scrollbar", () => {
    expect(css).toContain("scrollbar-color");
    expect(css).toContain("*::-webkit-scrollbar");
  });

  it("provides a visible focus ring for keyboard navigation", () => {
    expect(css).toMatch(/:focus-visible\s*{\s*outline:/);
  });

  it("disables non-essential animation and forces instant scrolling under prefers-reduced-motion", () => {
    const reducedMotionBlockMatch = css.match(
      /@media \(prefers-reduced-motion: reduce\) {([\s\S]*?)}\s*}/,
    );
    expect(reducedMotionBlockMatch).not.toBeNull();
    const block = reducedMotionBlockMatch?.[0] ?? "";
    expect(block).toContain("animation-duration: 0.01ms !important");
    expect(block).toContain("transition-duration: 0.01ms !important");
    expect(block).toContain("scroll-behavior: auto !important");
  });
});
