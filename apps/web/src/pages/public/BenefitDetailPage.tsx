import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CompactPublicHero } from "../../components/public/mobile";
import { FaqList, OutcomeList, PageCta } from "../../components/public/PublicPage";
import { BENEFITS, getBenefit } from "../../lib/public-content/benefits";
import { Seo } from "../../lib/seo/Seo";
import { NotFoundPage } from "../errors/NotFoundPage";
import { PublicActionCard } from "../../components/public/PublicActionCard";

const legalLabels: Record<string, string> = {
  "terminos-y-condiciones": "Términos y condiciones",
  "politica-de-privacidad": "Política de privacidad",
  "condiciones-portal-afiliado": "Condiciones del portal de afiliados",
  "tratamiento-de-datos": "Política de tratamiento de datos",
  "aviso-de-privacidad": "Aviso de privacidad",
  "tratamiento-datos-sensibles": "Tratamiento de datos sensibles",
  "politica-comunicaciones-electronicas": "Comunicaciones electrónicas",
};

export function BenefitDetailPage() {
  const benefit = getBenefit(useParams().slug ?? "");
  if (!benefit) return <NotFoundPage />;
  const relatedSlugs: readonly string[] = benefit.relatedSlugs;
  const related = BENEFITS.filter((item) => relatedSlugs.includes(item.slug));

  return <>
    <Seo custom={{ ...benefit.seo, path: `/beneficios/${benefit.slug}` }} breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Beneficios", path: "/beneficios" }, { name: benefit.title, path: `/beneficios/${benefit.slug}` }]} service={{ name: benefit.title, description: benefit.summary }} faq={benefit.faq} />
    <CompactPublicHero
      eyebrow="Beneficio"
      title={benefit.title}
      description={benefit.summary}
      actions={benefit.verifiedNotice
        ? [{ label: "Consultar mi plan", to: "/mi-cuenta/acceso", primary: true }, { label: "Solicitar orientación", to: "/comenzar?beneficio=plan-exequial-familiar" }]
        : [{ label: "Encontrar mi ruta", to: `/comenzar?beneficio=${benefit.slug}`, primary: true }, { label: "Volver al portafolio", to: "/beneficios" }]}
    />

    <section className="py-10 sm:py-16 lg:py-20" aria-labelledby="benefit-need-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        {benefit.verifiedNotice && (
          <aside className="mb-8 rounded-2xl border border-brand-orange/25 bg-brand-orange/5 p-5 sm:mb-12 sm:p-7" aria-labelledby="verified-benefit-heading">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Opción informada por ASODEF</p>
            <h2 id="verified-benefit-heading" className="mt-2 font-display text-2xl font-semibold tracking-[-.03em] sm:text-3xl">{benefit.verifiedNotice.heading}</h2>
            <p className="mt-3 text-sm leading-6 text-text-muted sm:text-base">{benefit.verifiedNotice.statement}</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Elementos informados para el plan">
              {benefit.verifiedNotice.facts.map((fact) => <li key={fact} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-text-main shadow-e1">{fact}</li>)}
            </ul>
            <div className="mt-5 rounded-2xl bg-brand-deep p-5 text-white shadow-e2">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-orange-light">ATENCIÓN RÁPIDA</p>
              <a className="mt-2 inline-flex min-h-12 items-center gap-2 font-display text-xl font-semibold text-white underline decoration-brand-orange underline-offset-4" href={benefit.verifiedNotice.channelHref}>Marca #523 gratis desde tu celular.<ArrowRight aria-hidden className="h-4 w-4" /></a>
            </div>
            <p className="mt-3 text-xs leading-5 text-text-muted">Confirma disponibilidad, requisitos y condiciones antes de solicitar esta opción.</p>
          </aside>
        )}
        <div className="grid gap-3 min-[390px]:grid-cols-2 lg:gap-6">
          <article className="flex min-h-48 flex-col rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-e1 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Necesidad</p>
            <h2 id="benefit-need-heading" className="mt-3 font-display text-xl font-semibold sm:text-2xl">El problema que aborda</h2>
            <p className="mt-3 text-sm leading-6 text-text-muted sm:text-base sm:leading-7">{benefit.problem}</p>
          </article>
          <article className="flex min-h-48 flex-col rounded-2xl bg-brand-deep p-5 text-white shadow-e3 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-orange-light">Resultado</p>
            <p className="mt-3 font-display text-xl font-semibold leading-snug sm:text-2xl">{benefit.outcome}</p>
          </article>
        </div>

        <div className="mt-8 grid gap-6 min-[390px]:grid-cols-2 lg:mt-12 lg:gap-12">
          <div>
            <h2 className="font-display text-xl font-semibold sm:text-2xl">Qué permite</h2>
            <div className="mt-4"><OutcomeList items={benefit.capabilities} /></div>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold sm:text-2xl">Quién puede consultarlo</h2>
            <p className="mt-4 text-sm leading-6 text-text-muted sm:text-base sm:leading-7">{benefit.eligibility}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brand-dark">Perfiles: {benefit.audience.join(", ")}</p>
          </div>
        </div>
      </div>
    </section>

    <section className="border-y border-brand-dark/10 bg-bg-soft/70 py-10 sm:py-16 lg:py-20" aria-labelledby="benefit-process-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Proceso</p>
        <h2 id="benefit-process-heading" className="mt-2 font-display text-2xl font-semibold tracking-[-.03em] sm:text-4xl">Cómo avanzar</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted sm:text-base sm:leading-7">Verifica tu vinculación y las condiciones específicas antes de solicitar el beneficio.</p>
        <ol className="mt-6 grid gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3">
          {benefit.process.map((item, index) => <li key={item} className="min-h-36 rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e1 min-[390px]:last:col-span-2 lg:last:col-span-1 sm:p-5">
            <span className="font-display text-2xl font-semibold text-brand-orange">{String(index + 1).padStart(2, "0")}</span>
            <p className="mt-3 text-sm leading-6 text-text-muted sm:text-base">{item}</p>
          </li>)}
        </ol>
        <div className="mt-6 rounded-2xl border border-brand-dark/10 bg-white p-5 sm:p-7">
          <h3 className="font-display text-xl font-semibold sm:text-2xl">Información que puede ser necesaria</h3>
          <div className="mt-4"><OutcomeList items={benefit.requiredInformation} /></div>
        </div>
      </div>
    </section>

    <section className="py-10 sm:py-16 lg:py-20" aria-labelledby="benefit-faq-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Preguntas frecuentes</p>
        <h2 id="benefit-faq-heading" className="mt-2 font-display text-2xl font-semibold tracking-[-.03em] sm:text-4xl">Antes de solicitar {benefit.title.toLowerCase()}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted sm:text-base sm:leading-7">Consulta el alcance y las condiciones que deben verificarse para esta categoría.</p>
        <div className="mt-6"><FaqList items={benefit.faq} /></div>

        <div className="mt-8 grid gap-3 min-[390px]:grid-cols-2" aria-label="Documentos relacionados">
          {benefit.legalSlugs.map((slug) => <Link key={slug} className="public-button-secondary min-h-12 justify-between" to={`/legal/${slug}`}>
            {legalLabels[slug] ?? "Documento relacionado"}
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
          </Link>)}
        </div>

        {related.length > 0 && <div className="mt-10 sm:mt-14">
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Beneficios relacionados</h2>
          <ul className="mt-4 grid gap-3 min-[390px]:grid-cols-2">
            {related.map((item) => <li className="h-full" key={item.slug}><PublicActionCard density="compact" headingLevel={3} title={item.title} description={item.summary} to={`/beneficios/${item.slug}`} actionLabel="Consultar" /></li>)}
          </ul>
        </div>}

        <Link className="mt-8 inline-flex min-h-12 items-center gap-2 font-semibold text-brand-dark sm:mt-10" to="/beneficios"><ArrowLeft aria-hidden className="h-4 w-4" />Todos los beneficios</Link>
      </div>
    </section>

    {benefit.verifiedNotice
      ? <PageCta title="Consulta la opción aplicable a tu vinculación" description="Inicia la verificación de afiliado o solicita orientación antes de continuar." label="Consultar mi plan" to="/mi-cuenta/acceso" />
      : <PageCta title="¿Quieres continuar con este beneficio?" description="Indica tu perfil para abrir el acceso o canal de atención correspondiente." label="Encontrar mi ruta" />}
  </>;
}
