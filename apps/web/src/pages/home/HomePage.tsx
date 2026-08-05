import { Heart, Users, GraduationCap, House, Palmtree, MessageCircle, Building2, Grid2X2Plus } from "lucide-react";
import { useContent } from "../../lib/content/useContent";
import { Hero } from "./Hero";
import { TrustBar } from "./TrustBar";
import { AboutSection } from "./AboutSection";
import { StatisticsSection } from "./StatisticsSection";
import { CompanyBenefits } from "./CompanyBenefits";
import { BenefitPortfolio } from "./BenefitPortfolio";
import { CoverageSection } from "./CoverageSection";
import { AllianceCta } from "./AllianceCta";
import { ContactSection } from "./ContactSection";

// US-020: the same approved copy as before (US-012), now also the
// fallback if GET /content is unreachable or hasn't published this key
// yet - the homepage must render identically either way.
const HERO_EYEBROW_FALLBACK = "ASODEF · Asociación para el desarrollo familiar";

// US-014 (reopened): same fallback contract as hero.eyebrow above -
// these are the exact dossier-sourced values seeded into ContentEntry
// (see content-catalog.ts), hardcoded here only as the fallback for
// when GET /content is unreachable or hasn't published these keys yet.
const STATISTICS_FALLBACK = {
  affiliateHolders: 8405,
  beneficiaries: 54692,
  experienceYearsLabel: "Más de 20 años",
  coverageLabel: "Cobertura nacional",
  agreementsLabel: "Red de convenios",
};

/**
 * Institutional homepage. US-012 (Hero), US-013 (TrustBar + About),
 * US-015 (Company Benefits + Benefit Portfolio), US-016 (Coverage +
 * Alliance CTA), and US-018 (Contact form) are all content-complete.
 * US-014 (Statistics) was reopened via a corporate-data update once
 * real, sourced figures became available (ASODEF institutional
 * dossier) - see StatisticsSection's own doc comment for the counter
 * implementation.
 *
 * Hero's/AllianceCta's "#contacto" anchors now resolve to a real,
 * working section (US-018) - previously a stable id with no target yet.
 *
 * US-020: hero.eyebrow is DB-hydrated via useContent(), falling back to
 * the same hardcoded copy on any failure/loading state - Hero itself
 * stays a plain `eyebrow?: string` prop, entirely unaware ContentEntry
 * exists (see useContent's own doc comment on the fallback contract).
 */
export function HomePage() {
  const content = useContent();
  const affiliateHolders = Number(content["institutional.statistics.affiliateHolders"] ?? STATISTICS_FALLBACK.affiliateHolders);
  const beneficiaries = Number(content["institutional.statistics.beneficiaries"] ?? STATISTICS_FALLBACK.beneficiaries);

  return (
    <>
      <Hero
        eyebrow={content["hero.eyebrow"] ?? HERO_EYEBROW_FALLBACK}
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

      <StatisticsSection
        eyebrow="ASODEF en cifras"
        heading="Más de 20 años acompañando a las familias"
        description="Nuestra escala institucional respalda el acompañamiento que brindamos a personas, familias y organizaciones en todo el país."
        numericStats={[
          { value: affiliateHolders, label: "Titulares afiliados" },
          { value: beneficiaries, label: "Beneficiarios" },
        ]}
        labeledStats={[
          { value: content["institutional.statistics.experienceYearsLabel"] ?? STATISTICS_FALLBACK.experienceYearsLabel, label: "Experiencia" },
          { value: content["institutional.statistics.coverageLabel"] ?? STATISTICS_FALLBACK.coverageLabel, label: "Cobertura" },
          { value: content["institutional.statistics.agreementsLabel"] ?? STATISTICS_FALLBACK.agreementsLabel, label: "Alianzas" },
        ]}
      />

      <CompanyBenefits
        eyebrow="Beneficios para tu organización"
        heading="Soluciones que aportan bienestar y valor"
        description="Acompañamos a las organizaciones con una propuesta cercana, flexible y orientada al bienestar de sus colaboradores y sus familias."
        cards={[
          { title: "Atención cercana", body: "Brindamos orientación clara y acompañamiento humano durante cada etapa del servicio." },
          { title: "Soluciones flexibles", body: "Adaptamos nuestra atención a las necesidades y características de cada organización." },
          { title: "Bienestar familiar", body: "Promovemos alternativas orientadas al bienestar de los colaboradores y sus familias." },
          { title: "Gestión responsable", body: "Desarrollamos procesos con respeto, transparencia y cuidado de la información." },
          { title: "Acompañamiento continuo", body: "Mantenemos canales de atención para orientar, resolver inquietudes y facilitar el acceso a los servicios." },
          { title: "Relaciones de confianza", body: "Construimos vínculos basados en el cumplimiento, la comunicación y el respeto mutuo." },
        ]}
      />

      <BenefitPortfolio
        eyebrow="Nuestro portafolio"
        heading="Alternativas pensadas para cada necesidad"
        description="Conoce las categorías que conforman nuestro portafolio institucional y encuentra opciones orientadas al bienestar de las personas, las familias y las organizaciones."
        categories={[
          { title: "Bienestar personal", description: "Alternativas orientadas al cuidado, la tranquilidad y la calidad de vida.", icon: Heart, linkHref: "#contacto" },
          { title: "Bienestar familiar", description: "Servicios pensados para acompañar las necesidades de las familias.", icon: Users, linkHref: "#contacto" },
          { title: "Educación y desarrollo", description: "Opciones que apoyan el aprendizaje, la formación y el crecimiento personal.", icon: GraduationCap, linkHref: "#contacto" },
          { title: "Hogar y protección", description: "Alternativas para contribuir al cuidado y la organización del entorno familiar.", icon: House, linkHref: "#contacto" },
          { title: "Recreación y experiencias", description: "Opciones para compartir, descansar y disfrutar momentos de bienestar.", icon: Palmtree, linkHref: "#contacto" },
          { title: "Orientación y acompañamiento", description: "Canales de apoyo para resolver inquietudes y facilitar el acceso a los servicios.", icon: MessageCircle, linkHref: "#contacto" },
          { title: "Soluciones para empresas", description: "Propuestas dirigidas a organizaciones interesadas en fortalecer el bienestar de sus equipos.", icon: Building2, linkHref: "#contacto" },
          { title: "Servicios complementarios", description: "Alternativas adicionales que amplían las posibilidades de atención y acompañamiento.", icon: Grid2X2Plus, linkHref: "#contacto" },
        ]}
      />

      <CoverageSection
        eyebrow="Presencia y acompañamiento"
        heading="Desde Cali, trabajamos cerca de ti"
        description="ASODEF tiene su sede principal en Cali y orienta su atención con cercanía, responsabilidad y vocación de servicio."
        cards={[
          {
            title: "Sede principal",
            body: "Nuestra sede principal se encuentra en Cali, desde donde coordinamos la atención y el acompañamiento institucional.",
          },
          {
            title: "Atención cercana",
            body: "Orientamos a personas, familias y organizaciones mediante canales de atención claros, humanos y responsables.",
          },
          {
            title: "Acompañamiento institucional",
            body: "Facilitamos información y orientación para que cada persona pueda conocer y acceder a los servicios disponibles.",
          },
        ]}
      />

      <AllianceCta
        eyebrow="Construyamos juntos"
        heading="Conviértete en aliado de ASODEF"
        description="Trabajamos con organizaciones interesadas en aportar al bienestar de sus colaboradores, sus familias y sus comunidades."
        primaryAction={{ label: "Quiero ser aliado", href: "#contacto" }}
        whatsapp={{
          label: "Hablar por WhatsApp",
          phoneNumber: "573232733927",
          message: "Hola, quiero conocer más información para ser aliado de ASODEF.",
        }}
      />

      <ContactSection
        eyebrow="Hablemos"
        heading="Contáctanos"
        description="Cuéntanos en qué podemos ayudarte y te responderemos lo antes posible."
      />
    </>
  );
}
