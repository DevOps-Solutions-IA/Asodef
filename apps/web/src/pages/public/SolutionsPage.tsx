import { Link, useParams } from "react-router-dom";
import { ArrowRight, Building2, Handshake, UserRound, UsersRound } from "lucide-react";
import { AUDIENCES, getAudience } from "../../lib/public-content/audiences";
import { EditorialSection, FaqList, OutcomeList, PageCta, PublicHero, SectionIntro } from "../../components/public/PublicPage";
import { Seo } from "../../lib/seo/Seo";
import { NotFoundPage } from "../errors/NotFoundPage";
import { PublicActionCard } from "../../components/public/PublicActionCard";

const icons = { personas: UserRound, afiliados: UsersRound, empresas: Building2, aliados: Handshake };

export function SolutionsPage() {
  return <><Seo routeKey="solutions" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Soluciones", path: "/soluciones" }]} />
    <PublicHero eyebrow="Soluciones por perfil" title={<>Elige cómo te relacionas con <span className="text-brand-orange">ASODEF</span></>} description="Consulta las gestiones, beneficios y portales disponibles para personas, afiliados, empresas y potenciales aliados." actions={[{ label: "Ayúdame a elegir", to: "/comenzar", primary: true }, { label: "Consultar beneficios", to: "/beneficios" }]} />
    <EditorialSection><SectionIntro eyebrow="Selecciona tu perfil" title="Abre tus opciones disponibles" description="Cada acceso reúne funciones y requisitos específicos para ese perfil."/><ul className="mt-12 grid gap-5 md:grid-cols-2">{AUDIENCES.map(audience=>{const Icon=icons[audience.slug]; return <li key={audience.slug} className="h-full"><PublicActionCard to={`/soluciones/${audience.slug}`} title={audience.title} description={audience.summary} icon={Icon} headingLevel={2} actionLabel="Ver funciones" /></li>})}</ul></EditorialSection>
    <EditorialSection tone="soft"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><SectionIntro eyebrow="Diferencia esencial" title="Beneficios explican valor; soluciones explican uso" description="Esta separación permite decidir sin repetir contenido ni mezclar una categoría disponible con una promesa contractual."/><div className="grid gap-5 sm:grid-cols-2"><article className="rounded-3xl bg-white p-7 shadow-e1"><p className="text-sm font-bold text-brand-orange">BENEFICIOS</p><p className="mt-4 leading-7 text-text-muted">Qué categorías existen, qué necesidad abordan y cómo verificar su condición.</p></article><article className="rounded-3xl bg-brand-deep p-7 text-white shadow-e3"><p className="text-sm font-bold text-brand-orange-light">SOLUCIONES</p><p className="mt-4 leading-7 text-white/70">Qué puede hacer un perfil, qué módulos aplican y cuál es el próximo paso.</p></article></div></div></EditorialSection>
    <PageCta title="¿No sabes qué perfil elegir?" description="Responde una pregunta inicial y continúa en la función que corresponde." label="Recibir orientación" />
  </>;
}

export function AudiencePage({ fixedAudience }: { fixedAudience?: "empresas" } = {}) {
  const params = useParams();
  const audience = getAudience(fixedAudience ?? params.audience ?? "");
  if (!audience) return <NotFoundPage />;
  return <><Seo custom={{ path: `/soluciones/${audience.slug}`, title: `${audience.title} | ASODEF`, description: audience.summary }} breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Soluciones", path: "/soluciones" }, { name: audience.title, path: `/soluciones/${audience.slug}` }]} faq={audience.faq}/>
    <PublicHero eyebrow="Solución por perfil" title={audience.title} description={audience.summary} actions={[...audience.heroActions]} />
    <EditorialSection><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><SectionIntro eyebrow="Necesidades" title="Qué puedes hacer" description="Estas funciones corresponden al portafolio y los módulos actuales de ASODEF."/><div className="surface-panel rounded-3xl p-8"><OutcomeList items={audience.needs}/></div></div></EditorialSection>
    <EditorialSection tone="soft"><SectionIntro eyebrow="Acciones disponibles" title="Continúa en el servicio específico" description="Cada acción abre el módulo que procesa esa gestión."/><ul className="mt-12 grid gap-5 lg:grid-cols-3">{audience.workflows.map((flow,i)=><li key={flow.title} className="h-full"><PublicActionCard to={flow.to} title={flow.title} description={flow.description} eyebrow={`0${i+1}`} headingLevel={2} actionLabel="Abrir" /></li>)}</ul></EditorialSection>
    <EditorialSection><div className="grid gap-14 lg:grid-cols-2"><div><SectionIntro eyebrow="Accesos" title="Portales y canales relacionados" description="Los accesos protegidos requieren una cuenta y el rol correspondiente."/><div className="mt-8 flex flex-wrap gap-3">{audience.portals.map(portal=><Link className="public-button-secondary" key={portal.to} to={portal.to}>{portal.label}<ArrowRight className="h-4 w-4"/></Link>)}</div></div><div><h2 className="font-display text-2xl font-semibold">Condiciones que debes conocer</h2><div className="mt-6"><OutcomeList items={audience.considerations}/></div></div></div><div className="mt-16"><FaqList items={audience.faq}/></div></EditorialSection>
    <PageCta title={`Continúa como ${audience.title.toLowerCase()}`} description={audience.slug === "afiliados" ? "Ingresa para consultar las funciones disponibles en tu cuenta." : audience.slug === "empresas" ? "Solicita orientación o entra al portal si ya tienes un rol autorizado." : "Abre el siguiente paso definido para este perfil."} label={audience.heroActions[0].label} to={audience.heroActions[0].to} />
  </>;
}

export function CompaniesPage() { return <AudiencePage fixedAudience="empresas" />; }
