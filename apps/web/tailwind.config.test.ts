import { describe, expect, it } from "vitest";
import tailwindConfig from "./tailwind.config";

describe("tailwind.config.ts design tokens", () => {
  const colors = tailwindConfig.theme?.extend?.colors as Record<string, string | Record<number, string>>;
  const fontFamily = tailwindConfig.theme?.extend?.fontFamily as Record<string, string[]>;

  it("exposes every ASODEF brand color token bound to its CSS custom property", () => {
    // Base brand anchors + semantic tokens - unchanged since before the
    // premium-redesign token expansion.
    expect(colors).toMatchObject({
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

  it("exposes full brand-dark/brand-orange tonal ramps and a warm-neutral scale (premium redesign)", () => {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(colors[`brand-dark-${step}`]).toBe(`var(--color-brand-dark-${step})`);
      expect(colors[`brand-orange-${step}`]).toBe(`var(--color-brand-orange-${step})`);
    }
    const neutral = tailwindConfig.theme?.extend?.colors as unknown as { neutral: Record<number, string> };
    for (const step of [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(neutral.neutral[step]).toBe(`var(--color-neutral-${step})`);
    }
  });

  it("exposes the e1-e4 elevation shadow scale and the xl2/xl3 radius steps (premium redesign)", () => {
    const boxShadow = tailwindConfig.theme?.extend?.boxShadow as Record<string, string>;
    expect(boxShadow).toEqual({ e1: "var(--shadow-e1)", e2: "var(--shadow-e2)", e3: "var(--shadow-e3)", e4: "var(--shadow-e4)" });

    const borderRadius = tailwindConfig.theme?.extend?.borderRadius as Record<string, string>;
    expect(borderRadius).toEqual({ xl2: "1.25rem", xl3: "1.75rem" });
  });

  it("maps font-sans to Inter, font-display to Outfit, and font-accent to Caveat", () => {
    expect(fontFamily.sans?.[0]).toBe("Inter");
    expect(fontFamily.display?.[0]).toBe("Outfit");
    expect(fontFamily.accent?.[0]).toBe("Caveat");
  });

  it("scans index.html, all src TS/TSX files, and the shared @asodef/ui component package for utility classes", () => {
    expect(tailwindConfig.content).toEqual([
      "./index.html",
      "./src/**/*.{ts,tsx}",
      "../../packages/ui/src/**/*.{ts,tsx}",
    ]);
  });
});
