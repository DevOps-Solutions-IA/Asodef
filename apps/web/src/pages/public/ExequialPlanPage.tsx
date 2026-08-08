import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  ChevronRight,
  Crown,
  DoorOpen,
  HandHeart,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { FaqList } from "../../components/public/PublicPage";
import { SafeReveal, StaggeredItems } from "../../components/public/motion";
import type { BenefitDefinition } from "../../lib/public-content/benefits";
import { Seo } from "../../lib/seo/Seo";

const benefitIcons = [DoorOpen, BusFront, Crown, HandHeart, ShieldCheck] as const;

const consultationSteps = [
  "Consulta tu vinculación",
  "Confirma disponibilidad",
  "Revisa las condiciones",
  "Solicita orientación si la necesitas",
] as const;

const privacyLinks = [
  { label: "Tratamiento de datos", to: "/legal/tratamiento-de-datos" },
  { label: "Política de privacidad", to: "/legal/politica-de-privacidad" },
  { label: "Centro Legal", to: "/legal" },
] as const;

export function ExequialPlanPage({ benefit, related }: { benefit: BenefitDefinition; related: readonly BenefitDefinition[] }) {
  const notice = benefit.verifiedNotice;
  if (!notice) return null;

  return <>
    <Seo
      custom={{ ...benefit.seo, path: `/beneficios/${benefit.slug}` }}
      breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Beneficios", path: "/beneficios" }, { name: benefit.title, path: `/beneficios/${benefit.slug}` }]}
      service={{ name: benefit.title, description: benefit.summary }}
      faq={benefit.faq}
    />

    <section className="relative isolate overflow-hidden border-b border-brand-dark/10 py-12 sm:py-16 lg:py-20">
      <div aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,#f8faf6_0%,#eef4ed_58%,#f8f4ed_100%)]" />
      <div aria-hidden className="absolute -right-48 -top-52 -z-10 h-[32rem] w-[32rem] rounded-full bg-brand-light/10 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_.58fr] lg:gap-16 lg:px-12">
        <SafeReveal>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Beneficio para afiliados</p>
          <h1 className="mt-3 max-w-4xl font-display text-[clamp(2.35rem,6vw,4.8rem)] font-semibold leading-[.98] tracking-[-.05em] text-text-main">Plan exequial familiar</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted sm:text-lg sm:leading-8">Una alternativa de acompañamiento para momentos importantes, sujeta a las condiciones de tu vinculación.</p>
          <div className="mt-7 grid gap-3 min-[390px]:grid-cols-2 sm:flex sm:flex-wrap">
            <Link className="public-button-primary w-full min-[390px]:w-auto" to="/mi-cuenta/acceso">Consultar mi plan<ArrowRight aria-hidden className="h-4 w-4" /></Link>
            <Link className="public-button-secondary w-full min-[390px]:w-auto" to="/comenzar?beneficio=plan-exequial-familiar">Solicitar orientación</Link>
          </div>
          <p className="mt-5 max-w-xl border-l-2 border-brand-orange pl-3 text-xs leading-5 text-text-muted sm:text-sm">Disponibilidad y condiciones sujetas a la vinculación específica del titular.</p>
        </SafeReveal>
        <SafeReveal className="hidden lg:block" delay={0.08}>
          <div className="rounded-[2rem] border border-white bg-white/80 p-8 shadow-e3 backdrop-blur-xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-deep text-white"><HandHeart aria-hidden className="h-6 w-6" /></span>
            <p className="mt-8 text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Consulta responsable</p>
            <p className="mt-3 font-display text-2xl font-semibold leading-snug">Verifica primero las condiciones aplicables a tu vinculación.</p>
          </div>
        </SafeReveal>
      </div>
    </section>

    <section className="py-14 sm:py-20 lg:py-24" aria-labelledby="plan-includes-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <SafeReveal className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Opción informada por ASODEF</p>
          <h2 id="plan-includes-heading" className="mt-3 font-display text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-tight tracking-[-.04em]">Plan preferencial para mayor acompañamiento familiar</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-text-muted sm:text-base sm:leading-7">Consulta el alcance informado y confirma su aplicación antes de solicitarlo.</p>
        </SafeReveal>

        <StaggeredItems className="mt-8 grid gap-3 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-4">
          {notice.facts.map((fact, index) => {
            const Icon = benefitIcons[index] ?? ShieldCheck;
            const separator = fact.indexOf(":");
            const title = separator === -1 ? fact : fact.slice(0, separator);
            const description = separator === -1 ? "" : fact.slice(separator + 1).trim();
            return <article key={fact} className={`h-full rounded-2xl border border-brand-dark/10 bg-white p-5 shadow-e1 transition duration-200 hover:-translate-y-0.5 hover:border-brand-dark/20 hover:shadow-e2 motion-reduce:transform-none motion-reduce:transition-none ${index === notice.facts.length - 1 ? "sm:col-span-2 lg:col-span-2" : ""}`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-dark/8 text-brand-dark"><Icon aria-hidden className="h-5 w-5" /></span>
              <h3 className="mt-4 font-display text-xl font-semibold leading-tight">{title}</h3>
              {description && <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>}
            </article>;
          })}
        </StaggeredItems>

        <SafeReveal className="mt-5" delay={0.06}>
          <a href={notice.channelHref} className="group flex min-h-16 flex-col justify-between gap-3 rounded-2xl bg-brand-deep px-5 py-4 text-white shadow-e2 transition duration-200 hover:bg-brand-dark hover:shadow-e3 focus-visible:ring-4 focus-visible:ring-brand-orange/30 motion-reduce:transition-none min-[390px]:flex-row min-[390px]:items-center sm:px-6">
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><Phone aria-hidden className="h-5 w-5 text-brand-orange-light" /></span>
              <span><span className="block text-[.68rem] font-bold uppercase tracking-[.18em] text-brand-orange-light">Atención rápida</span><span className="mt-1 block text-base font-semibold">Marca #523 gratis desde tu celular.</span></span>
            </span>
            <ArrowRight aria-hidden className="h-5 w-5 shrink-0 transition duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
          </a>
        </SafeReveal>
      </div>
    </section>

    <section className="border-y border-brand-dark/10 bg-bg-soft/70 py-14 sm:py-20 lg:py-24" aria-labelledby="plan-before-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:items-start lg:gap-14">
          <SafeReveal>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Antes de solicitarlo</p>
            <h2 id="plan-before-heading" className="mt-3 font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Cuatro pasos para confirmar tu opción</h2>
            <ol className="mt-7 grid gap-3 sm:grid-cols-2">
              {consultationSteps.map((step, index) => <li key={step} className="flex min-h-20 items-center gap-4 rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e1">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark font-display text-sm font-semibold text-white">{index + 1}</span>
                <span className="text-sm font-semibold leading-5 text-text-main sm:text-base">{step}</span>
              </li>)}
            </ol>
          </SafeReveal>

          <SafeReveal className="rounded-3xl border border-brand-dark/10 bg-white p-5 shadow-e2 sm:p-7" delay={0.06}>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Disponibilidad</p>
            <p className="mt-3 text-sm leading-6 text-text-muted sm:text-base sm:leading-7">Esta opción no es universal. Debe verificarse según la vinculación específica del titular.</p>
            <div className="mt-6 border-t border-brand-dark/10 pt-5">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-text-muted">Perfil</p>
              <p className="mt-2 font-display text-2xl font-semibold text-brand-dark">Afiliados</p>
            </div>
            <details className="mt-6 border-t border-brand-dark/10 pt-5 text-sm text-text-muted">
              <summary className="cursor-pointer font-semibold text-brand-dark focus-visible:outline-none">Información que puedes necesitar</summary>
              <ul className="mt-3 grid gap-2 pl-5 leading-6">
                {benefit.requiredInformation.map((item) => <li key={item} className="list-disc">{item}</li>)}
              </ul>
            </details>
          </SafeReveal>
        </div>
      </div>
    </section>

    <section className="py-14 sm:py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_.72fr] lg:gap-12 lg:px-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Preguntas frecuentes</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Información para consultar el plan</h2>
          <div className="mt-6"><FaqList items={benefit.faq} /></div>
          <details className="mt-5 rounded-2xl border border-brand-dark/10 bg-white p-5 text-sm leading-6 text-text-muted">
            <summary className="cursor-pointer font-semibold text-brand-dark focus-visible:outline-none">Fuente y alcance de esta información</summary>
            <p className="mt-3">{benefit.sourceBasis}</p>
          </details>
        </div>

        <aside className="h-fit rounded-3xl border border-brand-dark/10 bg-white p-5 shadow-e2 sm:p-6" aria-labelledby="plan-privacy-heading">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Protección de datos</p>
          <h2 id="plan-privacy-heading" className="mt-3 font-display text-2xl font-semibold leading-tight">Autorizaciones según su finalidad</h2>
          <p className="mt-3 text-sm leading-6 text-text-muted">Tus autorizaciones se gestionan de forma independiente según su finalidad.</p>
          <nav className="mt-5 border-y border-brand-dark/10" aria-label="Enlaces de protección de datos">
            {privacyLinks.map(({ label, to }) => <Link key={to} to={to} className="group flex min-h-12 items-center justify-between gap-4 border-b border-brand-dark/10 py-3 text-sm font-semibold text-brand-dark last:border-b-0 sm:text-base">
              <span>{label}</span><ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-brand-orange transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </Link>)}
          </nav>
        </aside>
      </div>
    </section>

    <section className="border-t border-brand-dark/10 bg-white/60 py-12 sm:py-16" aria-labelledby="related-benefits-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">También puedes consultar</p><h2 id="related-benefits-heading" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Beneficios relacionados</h2></div>
          <Link to="/beneficios" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-brand-dark sm:self-auto"><ArrowLeft aria-hidden className="h-4 w-4" />Volver al portafolio</Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {related.map((item) => <Link key={item.slug} to={`/beneficios/${item.slug}`} className="group flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e1 transition duration-200 hover:border-brand-dark/20 hover:shadow-e2 motion-reduce:transition-none">
            <span><span className="font-display text-lg font-semibold">{item.title}</span><span className="mt-1 block text-sm text-text-muted">{item.summary}</span></span><ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-brand-orange transition duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
          </Link>)}
        </div>
      </div>
    </section>
  </>;
}
