import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { CompactPublicHero } from "../../components/public/mobile";
import { PageCta } from "../../components/public/PublicPage";
import { PublicActionCard } from "../../components/public/PublicActionCard";
import { BENEFITS, type BenefitAudience, type BenefitNeed } from "../../lib/public-content/benefits";
import { Seo } from "../../lib/seo/Seo";

const audiences: { value: "todas" | BenefitAudience; label: string }[] = [
  { value: "todas", label: "Todos los perfiles" },
  { value: "personas", label: "Personas" },
  { value: "afiliados", label: "Afiliados" },
  { value: "empresas", label: "Empresas" },
  { value: "aliados", label: "Aliados" },
];

const needs: { value: "todas" | BenefitNeed; label: string }[] = [
  { value: "todas", label: "Todas las necesidades" },
  { value: "proteccion", label: "Protección" },
  { value: "salud", label: "Salud" },
  { value: "orientacion", label: "Orientación" },
  { value: "movilidad", label: "Movilidad" },
  { value: "educacion", label: "Educación" },
  { value: "ahorro", label: "Ahorro" },
];

export function BenefitsPage() {
  const [params, setParams] = useSearchParams();
  const audience = (params.get("audiencia") ?? "todas") as "todas" | BenefitAudience;
  const need = (params.get("necesidad") ?? "todas") as "todas" | BenefitNeed;
  const filtered = useMemo(
    () => BENEFITS.filter((item) => (audience === "todas" || (item.audience as readonly BenefitAudience[]).includes(audience)) && (need === "todas" || (item.needs as readonly BenefitNeed[]).includes(need))),
    [audience, need],
  );

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "todas") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return <>
    <Seo routeKey="benefits" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Beneficios", path: "/beneficios" }]} />
    <CompactPublicHero
      eyebrow="Beneficios"
      title="Encuentra una opción para tu necesidad"
      description="Filtra ocho categorías y consulta quién puede acceder, qué información se necesita y cómo continuar."
      actions={[{ label: "Encontrar por mi perfil", to: "/comenzar", primary: true }, { label: "Ver soluciones", to: "/soluciones" }]}
    />

    <section className="py-10 sm:py-16 lg:py-20" aria-labelledby="benefit-filter-heading">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">Explorar</p>
            <h2 id="benefit-filter-heading" className="mt-2 font-display text-2xl font-semibold tracking-[-.03em] text-text-main sm:text-4xl">Filtra por perfil y necesidad</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-text-muted">La selección queda guardada en la dirección de esta página.</p>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e1 sm:grid-cols-2 sm:p-5" aria-label="Filtros de beneficios">
          <label className="text-sm font-semibold">
            <span className="mb-2 flex items-center gap-2"><SlidersHorizontal aria-hidden className="h-4 w-4" />Perfil</span>
            <select className="min-h-12 w-full rounded-xl border border-brand-dark/15 bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2" value={audience} onChange={(event) => update("audiencia", event.target.value)}>
              {audiences.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            <span className="mb-2 block">Necesidad</span>
            <select className="min-h-12 w-full rounded-xl border border-brand-dark/15 bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2" value={need} onChange={(event) => update("necesidad", event.target.value)}>
              {needs.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <p className="mt-5 inline-flex min-h-8 items-center rounded-full bg-brand-dark/8 px-3 text-xs font-semibold text-brand-dark" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "categoría encontrada" : "categorías encontradas"}
        </p>

        {filtered.length ? (
          <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item, index) => <li key={item.slug} className="h-full">
              <PublicActionCard
                to={`/beneficios/${item.slug}`}
                title={item.title}
                description={item.summary}
                eyebrow={String(index + 1).padStart(2, "0")}
                headingLevel={2}
                actionLabel="Ver condiciones y proceso"
                footer={<span className="text-xs font-semibold uppercase tracking-wider text-brand-dark">{item.needs.join(" · ")}</span>}
                className="md:min-h-[19rem]"
              />
            </li>)}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-brand-dark/20 p-6 text-center sm:p-8">
            <h2 className="font-display text-xl font-semibold sm:text-2xl">No hay resultados con estos filtros</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">Cambia una selección o limpia los filtros para ver todo el portafolio.</p>
            <button className="public-button-secondary mt-5" onClick={() => setParams({}, { replace: true })}>Limpiar filtros</button>
          </div>
        )}
      </div>
    </section>

    <PageCta title="¿No sabes cuál elegir?" description="Indica tu perfil y necesidad para abrir el beneficio, trámite o portal aplicable." label="Recibir orientación" />
  </>;
}
