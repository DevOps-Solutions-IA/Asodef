import { Hero } from "./Hero";
import { TrustBar } from "./TrustBar";
import { AboutSection } from "./AboutSection";

/**
 * Institutional homepage. US-012 (Hero) and US-013 (TrustBar + About)
 * are both content-complete with approved Spanish copy.
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

      <TrustBar
        items={[
          { label: "Atención cercana", sublabel: "Acompañamiento humano y responsable" },
          { label: "Gestión confiable", sublabel: "Procesos claros y orientados al bienestar" },
          { label: "Compromiso familiar", sublabel: "Soluciones pensadas para las familias" },
          { label: "Servicio responsable", sublabel: "Atención con respeto, transparencia y cuidado" },
        ]}
      />

      <AboutSection
        eyebrow="Conoce a ASODEF"
        heading="Quiénes somos"
        description="Somos una asociación comprometida con el bienestar y el desarrollo de las familias. Trabajamos con cercanía, responsabilidad y vocación de servicio, acompañando a personas y organizaciones mediante soluciones orientadas a sus necesidades."
        cards={[
          {
            title: "Nuestra historia",
            body: "ASODEF nace con el propósito de acompañar a las familias y contribuir a su bienestar mediante una gestión cercana, humana y responsable.",
          },
          {
            title: "Nuestra misión",
            body: "Brindar atención y soluciones que aporten al bienestar de las personas, las familias y las organizaciones, actuando con compromiso, respeto y transparencia.",
          },
          {
            title: "Nuestra visión",
            body: "Ser una organización reconocida por su cercanía, confianza y capacidad de generar valor para las familias y las comunidades que acompaña.",
          },
        ]}
      />
    </>
  );
}
