import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, FileText, Layers3, Search, ShieldCheck } from "lucide-react";
import { Badge, EmptyState, ErrorState, Input, Skeleton } from "@asodef/ui";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { LEGAL_CATEGORIES, LEGAL_DOCUMENT_CATALOG } from "../../lib/legal/legal-catalog";
import { queryKeys } from "../../lib/query-keys";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function LegalCenterPage() {
  const [search, setSearch] = useState("");
  const results = useQueries({
    queries: LEGAL_DOCUMENT_CATALOG.map((entry) => ({
      queryKey: queryKeys.legalDocuments.detail(entry.slug),
      queryFn: () => getPublicLegalDocument(entry.slug),
      retry: false,
    })),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return LEGAL_DOCUMENT_CATALOG;
    return LEGAL_DOCUMENT_CATALOG.filter((entry) => `${entry.title} ${entry.description} ${entry.category}`.toLocaleLowerCase("es").includes(query));
  }, [search]);

  const latestPublication = results
    .map((result) => result.data?.publicationDate)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
  const hasNetworkError = results.some((result) => result.isError && result.error && (result.error as { kind?: string }).kind !== "not_found");

  return (
    <div className="flex flex-col gap-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-brand-dark/10 bg-brand-dark px-6 py-9 text-white shadow-e4 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-green/30" aria-hidden="true" />
        <div className="absolute -bottom-24 right-20 h-48 w-48 rounded-full bg-brand-orange/15" aria-hidden="true" />
        <div className="absolute inset-y-0 right-0 hidden w-2/5 border-l border-white/5 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.05))] lg:block" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-orange-200">Información oficial</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Centro Legal ASODEF</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
            Consulta las políticas, autorizaciones y condiciones vigentes que explican cómo operamos, protegemos tus datos y respaldamos cada interacción digital.
          </p>
          <p className="mt-5 text-xs text-white/65">
            {latestPublication ? `Última actualización: ${formatDate(latestPublication)}` : "Verificando versiones publicadas…"}
          </p>
        </div>
        <div className="relative mt-8 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3 lg:max-w-3xl">
          <span className="flex items-center gap-2 text-xs text-white/75"><BookOpenCheck className="h-4 w-4 text-brand-light" aria-hidden="true" /> Versiones oficiales vigentes</span>
          <span className="flex items-center gap-2 text-xs text-white/75"><Layers3 className="h-4 w-4 text-brand-light" aria-hidden="true" /> Historial institucional preservado</span>
          <span className="flex items-center gap-2 text-xs text-white/75"><ShieldCheck className="h-4 w-4 text-brand-light" aria-hidden="true" /> Publicación controlada</span>
        </div>
      </section>

      <section aria-labelledby="legal-library-heading">
        <div className="sticky top-20 z-10 -mx-3 flex flex-col justify-between gap-4 rounded-2xl border border-transparent bg-surface-canvas/90 px-3 py-3 backdrop-blur-md sm:flex-row sm:items-end lg:top-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-green">Biblioteca institucional</p>
            <h2 id="legal-library-heading" className="mt-1 font-display text-2xl font-semibold text-brand-dark">Documentos vigentes</h2>
            <p className="mt-1 text-sm text-text-muted">21 documentos organizados por tema para encontrar la información con rapidez.</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <label htmlFor="legal-search" className="sr-only">Buscar documento legal</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <Input id="legal-search" type="search" className="pl-10" placeholder="Buscar por título, tema o palabra…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        {hasNetworkError && <ErrorState className="mt-6" description="No pudimos verificar algunos documentos. Intenta recargar la página." />}

        <div className="mt-8 flex flex-col gap-10">
          {LEGAL_CATEGORIES.map((category) => {
            const entries = filtered.filter((entry) => entry.category === category);
            if (entries.length === 0) return null;
            return (
              <section key={category} aria-labelledby={`category-${category.replaceAll(" ", "-")}`}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-px w-8 bg-brand-orange" aria-hidden="true" />
                  <h3 id={`category-${category.replaceAll(" ", "-")}`} className="font-display text-lg font-semibold text-text-main">{category}</h3>
                </div>
                <ul className="grid gap-4 md:grid-cols-2">
                  {entries.map((entry) => {
                    const index = LEGAL_DOCUMENT_CATALOG.indexOf(entry);
                    const result = results[index];
                    const published = result?.isSuccess && Boolean(result.data.content);
                    return (
                      <li key={entry.slug}>
                        <Link to={`/legal/${entry.slug}`} className="premium-card-glow group flex h-full flex-col rounded-2xl border border-border-soft bg-white p-5 shadow-e1 transition duration-enterprise ease-enterprise hover:-translate-y-0.5 hover:border-brand-dark/20 hover:shadow-e3 motion-reduce:transform-none">
                          <div className="flex items-start justify-between gap-4">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-dark-50 text-brand-dark"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                            {result?.isPending ? <Skeleton className="h-6 w-20" /> : published ? <Badge variant="success">Vigente</Badge> : <Badge variant="neutral">No disponible</Badge>}
                          </div>
                          <h4 className="mt-4 font-display text-lg font-semibold text-text-main group-hover:text-brand-dark">{entry.title}</h4>
                          <p className="mt-2 flex-1 text-sm leading-6 text-text-muted">{entry.description}</p>
                          <div className="mt-5 flex items-center justify-between border-t border-border-soft pt-4 text-xs text-text-muted">
                            <span>{published ? `Versión ${result.data.version} · ${formatDate(result.data.effectiveDate ?? result.data.publicationDate!)}` : "Verificando publicación"}</span>
                            <span className="flex items-center gap-1 font-semibold text-brand-dark">Ver documento <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" /></span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {filtered.length === 0 && <EmptyState className="mt-8" icon={<Search className="h-9 w-9" aria-hidden="true" />} title="Sin resultados" description="Prueba con otra palabra o consulta una categoría diferente." />}
      </section>

      <aside className="flex flex-col justify-between gap-4 rounded-2xl border border-brand-dark/10 bg-brand-dark-50 p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-lg font-semibold text-brand-dark">¿Quieres ejercer un derecho sobre tus datos?</h2>
          <p className="mt-1 text-sm text-text-muted">Radica una consulta, corrección, revocación u otra solicitud y recibe una referencia de seguimiento.</p>
        </div>
        <Link to="/legal/solicitudes-de-datos" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white shadow-e1 hover:bg-brand-dark-600 focus-visible:outline-brand-orange">Crear solicitud <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </aside>
    </div>
  );
}
