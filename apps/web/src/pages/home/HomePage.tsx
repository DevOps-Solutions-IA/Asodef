import { Hero } from "./Hero";
import { TrustBar } from "./TrustBar";
import { AboutSection } from "./AboutSection";

/**
 * Institutional homepage. US-012 (Hero) is content-complete with
 * approved Spanish copy. US-013 (TrustBar + About) is PARTIALLY
 * COMPLETE: both sections are fully built, tested, animated, and wired
 * here technically, but real institutional content is still pending
 * approval - see the US-013 completion report for the exact content
 * specification and what's missing.
 *
 * Statistics/Benefits/Portfolio/Coverage/Alliance-CTA are separate,
 * later stories and are not stubbed here. Hero's CTA anchors
 * (#portafolio, #contacto) remain stable ids for those future sections.
 */
export function HomePage() {
  return (
    <>
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

      {/* TrustBar's 4 trust items have no confirmed content anywhere in
       * the approved project sources - the component renders nothing
       * until real content is supplied (see the US-013 report). */}
      <TrustBar />

      <AboutSection
        heading="Quiénes somos"
        cards={[
          // Card titles are the PRD's own confirmed section labels
          // (routes list: "Quiénes somos"). The body paragraphs (the
          // actual Historia/Misión/Visión copy from "master prompt
          // section 12") are not present in any approved project
          // source - see the US-013 report - so they stay omitted
          // rather than invented.
          { title: "Nuestra historia" },
          { title: "Nuestra misión" },
          { title: "Nuestra visión" },
        ]}
      />
    </>
  );
}
