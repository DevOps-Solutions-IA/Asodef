import { ShieldCheck, Heart, Scale, Car, HeartPulse, GraduationCap, ShoppingCart, Handshake } from "lucide-react";
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
        description="En ASODEF creemos que proteger a las familias va más allá de ofrecer un servicio; significa crear oportunidades, generar tranquilidad y construir alianzas que mejoren la calidad de vida de miles de personas."
        cards={[
          {
            title: "Nuestra historia",
            body: "ASODEF S.A.S. es una organización con más de 20 años de trayectoria, cuyos orígenes se remontan al Fondo de Empleados de Emssanar. En el año 2012 evolucionó a ASODEF S.A.S., fortaleciendo su modelo de atención y ampliando su cobertura a nivel nacional. Hoy trabajamos desde nuestra sede principal en Cali, con presencia en todo el país, ofreciendo soluciones de protección familiar, bienestar y una red de convenios estratégicos que generan beneficios reales para nuestros afiliados.",
          },
          {
            title: "Nuestra misión",
            body: "Brindar bienestar, protección y beneficios a las familias colombianas mediante soluciones integrales, planes de protección y una sólida red de convenios con empresas aliadas, generando ahorro, confianza y tranquilidad con un servicio humano y de calidad.",
          },
          {
            title: "Nuestra visión",
            body: "Ser la red de beneficios familiares más reconocida de Colombia, consolidando alianzas estratégicas que generen valor para nuestros afiliados y para las empresas que confían en ASODEF como un aliado para su crecimiento.",
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
        heading="¿Por qué hacer una alianza con ASODEF?"
        description="Conectamos su empresa con miles de familias que buscan beneficios reales."
        cards={[
          { title: "Mayor visibilidad", body: "Promocionamos su empresa entre nuestros afiliados mediante campañas digitales y comunicación directa." },
          { title: "Nuevos clientes", body: "Su negocio accede a una comunidad de más de 54.000 beneficiarios y sus familias." },
          { title: "Difusión permanente", body: "Promoción a través de WhatsApp, redes sociales, material institucional y asesores comerciales." },
          { title: "Alianza estratégica", body: "Construimos relaciones de largo plazo basadas en beneficios mutuos y en la confianza." },
          { title: "Mayor fidelización", body: "Los afiliados prefieren utilizar los establecimientos que hacen parte de nuestra red de aliados." },
          { title: "Posicionamiento de marca", body: "Su empresa fortalece su reconocimiento al asociarse con una organización con más de 20 años de trayectoria." },
        ]}
      />

      <BenefitPortfolio
        eyebrow="Nuestro portafolio"
        heading="Nuestro portafolio de beneficios"
        description="Soluciones que generan bienestar, protección y ahorro para miles de familias colombianas."
        categories={[
          {
            title: "Plan Exequial Familiar",
            description: "Cobertura para el titular y su grupo familiar. Acompañamiento y asistencia integral en los momentos más difíciles.",
            icon: ShieldCheck,
            linkHref: "#contacto",
          },
          {
            title: "Seguro de Vida",
            description: "Protección económica para su familia. Tranquilidad hoy, respaldo siempre.",
            icon: Heart,
            linkHref: "#contacto",
          },
          {
            title: "Asesoría Jurídica",
            description: "Orientación profesional en diferentes áreas del derecho. Acompañamiento legal con tarifas preferenciales.",
            icon: Scale,
            linkHref: "#contacto",
          },
          {
            title: "Movilidad",
            description: "Descuentos en CDA. Beneficios en repuestos, accesorios y servicios para su vehículo.",
            icon: Car,
            linkHref: "#contacto",
          },
          {
            title: "Salud y Bienestar",
            description: "Red de farmacias. Imágenes diagnósticas con descuentos. Ópticas y salud visual.",
            icon: HeartPulse,
            linkHref: "#contacto",
          },
          {
            title: "Educación",
            description: "Papelería y útiles escolares. Convenios educativos. Apoyo al desarrollo académico.",
            icon: GraduationCap,
            linkHref: "#contacto",
          },
          {
            title: "Convenios Comerciales",
            description: "Descuentos exclusivos en comercios aliados. Beneficios permanentes para el titular y su grupo familiar.",
            icon: ShoppingCart,
            linkHref: "#contacto",
          },
          {
            title: "Nuevos Convenios",
            description: "Veterinarias, supermercados, restaurantes, gimnasios, turismo y más.",
            icon: Handshake,
            linkHref: "#contacto",
          },
        ]}
      />

      <CoverageSection
        eyebrow="Presencia y acompañamiento"
        heading="Cobertura nacional"
        description="Estamos presentes en todo el país, a través de una red de aliados, asesores y canales de atención, para estar siempre cerca de nuestros afiliados."
        cards={[
          {
            title: "Sede principal",
            body: "Cali es nuestra sede principal, desde donde coordinamos la atención y el acompañamiento institucional a nivel nacional.",
          },
          {
            title: "Red de aliados",
            body: "Una red de aliados que crece día a día para ofrecer más beneficios y ahorro a nuestros afiliados en todo el país.",
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
