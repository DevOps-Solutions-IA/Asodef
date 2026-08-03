import { describe, expect, it } from "vitest";
import tailwindConfig from "./tailwind.config";

describe("tailwind.config.ts design tokens", () => {
  const colors = tailwindConfig.theme?.extend?.colors as Record<string, string>;
  const fontFamily = tailwindConfig.theme?.extend?.fontFamily as Record<string, string[]>;

  it("exposes every ASODEF brand color token bound to its CSS custom property", () => {
    expect(colors).toEqual({
      "brand-dark": "var(--color-brand-dark)",
      "brand-deep": "var(--color-brand-deep)",
      "brand-green": "var(--color-brand-green)",
      "brand-light": "var(--color-brand-light)",
      "brand-orange": "var(--color-brand-orange)",
      "brand-orange-light": "var(--color-brand-orange-light)",
      "bg-base": "var(--color-bg-base)",
      "bg-soft": "var(--color-bg-soft)",
      "bg-elevated": "var(--color-bg-elevated)",
      "text-main": "var(--color-text-main)",
      "text-muted": "var(--color-text-muted)",
      "border-soft": "var(--color-border-soft)",
      success: "var(--color-success)",
      warning: "var(--color-warning)",
      danger: "var(--color-danger)",
      info: "var(--color-info)",
    });
  });

  it("maps font-sans to Inter, font-display to Outfit, and font-accent to Caveat", () => {
    expect(fontFamily.sans?.[0]).toBe("Inter");
    expect(fontFamily.display?.[0]).toBe("Outfit");
    expect(fontFamily.accent?.[0]).toBe("Caveat");
  });

  it("scans index.html and all src TS/TSX files for utility classes", () => {
    expect(tailwindConfig.content).toEqual(["./index.html", "./src/**/*.{ts,tsx}"]);
  });
});
