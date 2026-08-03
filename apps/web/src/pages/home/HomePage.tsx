import { Hero } from "./Hero";

/**
 * Institutional homepage. US-012 (Hero section) is now content-complete
 * with the approved Spanish copy below - eyebrow/heading/supportingCopy/
 * ctas/stats are all real, approved values (see the US-012 completion
 * report for the approval record), not placeholders.
 *
 * TrustBar/About/Statistics/Benefits/Portfolio/Coverage/Alliance-CTA are
 * separate, later stories and are not stubbed here. The Hero's CTA
 * anchors (#portafolio, #contacto) are stable ids those later sections
 * must use so the links resolve once they exist - they are harmless,
 * valid hash navigations today even with no matching element yet.
 *
 * The hero image stays the abstract placeholder from US-012 with
 * alt="" (decorative) - Hero.tsx has no imageAlt prop yet by design;
 * one will be added only when a real photograph is wired in.
 */
export function HomePage() {
  return (
    <Hero
      eyebrow="ASODEF · Asociación para el desarrollo familiar"
      heading={
        <>
          Soluciones que fortalecen el <span className="text-brand-orange">bienestar y desarrollo</span> de las familias
        </>
      }
      supportingCopy="Acompañamos a personas, familias y organizaciones con una atención cercana, responsable y orientada a construir bienestar."
      ctas={[
        { label: "Centro de pagos", href: "/pagos", variant: "primary" },
        { label: "Conoce nuestro portafolio", href: "#portafolio", variant: "outline" },
        { label: "Contáctanos", href: "#contacto", variant: "outline" },
      ]}
      stats={[
        { value: "Cercanía", label: "Atención humana" },
        { value: "Confianza", label: "Gestión responsable" },
        { value: "Bienestar", label: "Compromiso familiar" },
      ]}
    />
  );
}
