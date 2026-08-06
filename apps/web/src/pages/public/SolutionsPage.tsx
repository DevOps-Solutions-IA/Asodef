import { Link, useParams } from "react-router-dom";
import { ArrowRight, Building2, Handshake, UserRound, UsersRound } from "lucide-react";
import { AUDIENCES, getAudience } from "../../lib/public-content/audiences";
import { EditorialSection, FaqList, OutcomeList, PageCta, PublicHero, SectionIntro } from "../../components/public/PublicPage";
import { Seo } from "../../lib/seo/Seo";
import { NotFoundPage } from "../errors/NotFoundPage";

const icons = { personas: UserRound, afiliados: UsersRound, empresas: Building2, aliados: Handshake };

export function SolutionsPage() {
  return <><Seo routeKey="solutions" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Soluciones", path: "/soluciones" }]} />
    <PublicHero eyebrow="Soluciones por perfil" title={<>Elige cómo te relacionas con <span className="text-brand-orange">ASODEF</span></>} description="Consulta las gestiones, beneficios y portales disponibles para personas, afiliados, empresas y potenciales aliados." actions={[{ label: "Ayúdame a elegir", to: "/comenzar", primary: true }, { label: "Consultar beneficios", to: "/beneficios" }]} />
    <EditorialSection><SectionIntro eyebrow="Selecciona tu perfil" title="Abre tus opciones disponibles" description="Cada acceso reúne funciones y requisitos específicos para ese perfil."/><div className="mt-12 grid gap-5 md:grid-cols-2">{AUDIENCES.map(audience=>{const Icon=icons[audience.slug]; return <Link key={audience.slug} to={`/soluciones/${audience.slug}`} className="group rounded-[2rem] border border-brand-dark/10 bg-white p-8 shadow-e1 transition hover:-translate-y-1 hover:shadow-e3 motion-reduce:transform-none"><Icon aria-hidden className="h-8 w-8 text-brand-orange"/><h2 className="mt-8 font-display text-3xl font-semibold">{audience.title}</h2><p className="mt-4 leading-7 text-text-muted">{audience.summary}</p><span className="mt-8 inline-flex items-center gap-2 font-semibold text-brand-dark">Ver funciones<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1 motion-reduce:transform-none"/></span></Link>})}</div></EditorialSection>
    <EditorialSection tone="soft"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><SectionIntro eyebrow="Diferencia esencial" title="Beneficios explican valor; soluciones explican uso" description="Esta separación permite decidir sin repetir contenido ni mezclar una categoría disponible con una promesa contractual."/><div className="grid gap-5 sm:grid-cols-2"><article className="rounded-3xl bg-white p-7 shadow-e1"><p className="text-sm font-bold text-brand-orange">BENEFICIOS</p><p className="mt-4 leading-7 text-text-muted">Qué categorías existen, qué necesidad abordan y cómo verificar su condición.</p></article><article className="rounded-3xl bg-brand-deep p-7 text-white shadow-e3"><p className="text-sm font-bold text-brand-orange-light">SOLUCIONES</p><p className="mt-4 leading-7 text-white/70">Qué puede hacer un perfil, qué módulos aplican y cuál es el próximo paso.</p></article></div></div></EditorialSection>
    <PageCta title="¿No sabes qué perfil elegir?" description="Responde una pregunta inicial y continúa en la función que corresponde." label="Recibir orientación" />
  </>;
}

export function AudiencePage({ fixedAudience }: { fixedAudience?: "empresas" } = {}) {
  const params = useParams();
  const audience = getAudience(fixedAudience ?? params.audience ?? "");
  if (!audience) return <NotFoundPage />;
  return <><Seo custom={{ path: `/soluciones/${audience.slug}`, title: `${audience.title} | ASODEF`, description: audience.summary }} breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Soluciones", path: "/soluciones" }, { name: audience.title, path: `/soluciones/${audience.slug}` }]} faq={audience.faq}/>
    <PublicHero eyebrow="Solución por perfil" title={audience.title} description={audience.summary} actions={[{ label: "Iniciar recorrido", to: `/comenzar?perfil=${audience.slug === "empresas" ? "empresa" : audience.slug === "aliados" ? "aliado" : audience.slug}`, primary: true }, { label: "Ver beneficios", to: `/beneficios?audiencia=${audience.slug}` }]} />
    <EditorialSection><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><SectionIntro eyebrow="Necesidades" title="Qué puedes hacer" description="Estas funciones corresponden al portafolio y los módulos actuales de ASODEF."/><div className="surface-panel rounded-3xl p-8"><OutcomeList items={audience.needs}/></div></div></EditorialSection>
    <EditorialSection tone="soft"><SectionIntro eyebrow="Acciones disponibles" title="Continúa en el servicio específico" description="Cada acción abre el módulo que procesa esa gestión."/><div className="mt-12 grid gap-5 lg:grid-cols-3">{audience.workflows.map((flow,i)=><article key={flow.title} className="flex flex-col rounded-3xl bg-white p-7 shadow-e1"><span className="text-xs font-bold text-brand-orange">0{i+1}</span><h2 className="mt-7 font-display text-2xl font-semibold">{flow.title}</h2><p className="mt-4 flex-1 leading-7 text-text-muted">{flow.description}</p><Link className="mt-7 inline-flex items-center gap-2 font-semibold text-brand-dark" to={flow.to}>Abrir<ArrowRight className="h-4 w-4"/></Link></article>)}</div></EditorialSection>
    <EditorialSection><div className="grid gap-14 lg:grid-cols-2"><div><SectionIntro eyebrow="Accesos" title="Portales y canales relacionados" description="Los accesos protegidos requieren una cuenta y el rol correspondiente."/><div className="mt-8 flex flex-wrap gap-3">{audience.portals.map(portal=><Link className="public-button-secondary" key={portal.to} to={portal.to}>{portal.label}<ArrowRight className="h-4 w-4"/></Link>)}</div></div><div><h2 className="font-display text-2xl font-semibold">Condiciones que debes conocer</h2><div className="mt-6"><OutcomeList items={audience.considerations}/></div></div></div><div className="mt-16"><FaqList items={audience.faq}/></div></EditorialSection>
    <PageCta title={`Continúa como ${audience.title.toLowerCase()}`} description="El orientador conserva tu perfil y solicita solo la información necesaria." label="Continuar" />
  </>;
}

export function CompaniesPage() { return <AudiencePage fixedAudience="empresas" />; }
