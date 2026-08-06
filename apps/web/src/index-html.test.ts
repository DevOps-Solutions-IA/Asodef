// @vitest-environment node
// Reads the real index.html from disk via a file:// URL - same rationale
// as global-css.test.ts (jsdom's URL handling doesn't resolve
// import.meta.url compatibly with fileURLToPath here).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const htmlPath = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(htmlPath, "utf-8");

describe("index.html SEO metadata (US-019)", () => {
  it("sets the exact specified <title>", () => {
    expect(html).toContain("<title>ASODEF | Beneficios y gestión para familias y organizaciones</title>");
  });

  it("sets the exact specified meta description", () => {
    expect(html).toContain(
      'content="Conoce los beneficios, canales digitales y rutas de atención que ASODEF conecta para personas, afiliados, empresas y aliados."',
    );
  });

  it("sets Open Graph metadata", () => {
    expect(html).toMatch(/<meta property="og:type" content="website"/);
    expect(html).toMatch(/<meta property="og:title" content="ASODEF \| Beneficios y gestión para familias y organizaciones"/);
    expect(html).toMatch(/<meta property="og:image" content="%VITE_APP_URL%\/og-image\.webp"/);
    expect(html).toMatch(/<meta property="og:url" content="%VITE_APP_URL%\/"/);
  });

  it("sets Twitter Card metadata", () => {
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
    expect(html).toMatch(/<meta name="twitter:title"/);
    expect(html).toMatch(/<meta name="twitter:image" content="%VITE_APP_URL%\/og-image\.webp"/);
  });

  it("US-077: links a real favicon derived from the official logo, not a placeholder", () => {
    expect(html).toMatch(/<link rel="icon" type="image\/x-icon" href="\/favicon\.ico"/);
    expect(html).toMatch(/<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32x32\.png"/);
    expect(html).toMatch(/<link rel="icon" type="image\/png" sizes="16x16" href="\/favicon-16x16\.png"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  });

  it("sets a canonical link driven by the environment, never a hardcoded protected subdomain", () => {
    expect(html).toMatch(/<link rel="canonical" href="%VITE_APP_URL%\/"/);
    // info@asodef.com.co (the confirmed corporate email) is fine - the
    // protected existing-service subdomains are not.
    expect(html).not.toMatch(/app\.asodef\.com\.co|api\.asodef\.com\.co|webhook\.asodef\.com\.co/);
  });

  it("embeds Organization JSON-LD with only confirmed facts - no fabricated claims", () => {
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    const jsonLd = JSON.parse(match![1]!.replaceAll("%VITE_APP_URL%", "https://example.invalid"));

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ASODEF S.A.S.",
      email: "info@asodef.com.co",
      logo: "https://example.invalid/icon-512.png",
      address: { "@type": "PostalAddress", addressLocality: "Cali", addressCountry: "CO" },
    });

    // Never invent unverified structured data.
    expect(jsonLd).not.toHaveProperty("aggregateRating");
    expect(jsonLd).not.toHaveProperty("review");
    expect(jsonLd).not.toHaveProperty("sameAs");
    expect(jsonLd).not.toHaveProperty("areaServed");
  });
});
