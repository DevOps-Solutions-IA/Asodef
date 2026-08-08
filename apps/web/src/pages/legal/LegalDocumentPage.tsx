import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarDays, FileText, Printer } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { LEGAL_DOCUMENT_CATALOG } from "../../lib/legal/legal-catalog";
import { queryKeys } from "../../lib/query-keys";

export interface LegalDocumentPageProps { slug: string; title: string; }

function anchorId(heading: string, index: number): string {
  const normalized = heading.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || `seccion-${index + 1}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha informada";
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function LegalDocumentPage({ slug, title }: LegalDocumentPageProps) {
  const { data, isPending, isError, error } = useQuery({ queryKey: queryKeys.legalDocuments.detail(slug), queryFn: () => getPublicLegalDocument(slug), retry: false });
  const catalogEntry = LEGAL_DOCUMENT_CATALOG.find((entry) => entry.slug === slug);
  const index = LEGAL_DOCUMENT_CATALOG.findIndex((entry) => entry.slug === slug);
  const previous = index > 0 ? LEGAL_DOCUMENT_CATALOG[index - 1] : null;
  const next = index >= 0 && index < LEGAL_DOCUMENT_CATALOG.length - 1 ? LEGAL_DOCUMENT_CATALOG[index + 1] : null;
  const sections = useMemo(() => data?.content?.sections.map((section, sectionIndex) => ({ ...section, id: anchorId(section.heading, sectionIndex) })) ?? [], [data]);
  const notPublished = isError && error instanceof ApiError && error.kind === "not_found";

  return (
    <article className="legal-document-print">
      <header className="relative overflow-hidden rounded-[1.75rem] border border-border-soft bg-white p-6 shadow-e2 sm:p-8">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-orange via-brand-green to-brand-dark" />
        <nav aria-label="Migas de pan" className="text-xs text-text-muted"><Link to="/legal" className="hover:text-brand-dark hover:underline">Centro Legal</Link><span aria-hidden="true"> / </span><span>{catalogEntry?.category ?? "Documento"}</span></nav>
        <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="max-w-3xl">
            {data && <div className="mb-3 flex flex-wrap items-center gap-2"><Badge variant="success">Vigente</Badge></div>}
            <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-dark sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-text-muted">{data?.content?.summary ?? catalogEntry?.description}</p>
          </div>
          <Button type="button" variant="outline" className="print-hide shrink-0 self-start" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />Imprimir</Button>
        </div>
        {data && <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted"><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-green" aria-hidden="true" />Vigente desde {formatDate(data.effectiveDate ?? data.publicationDate)}</span><span>Publicada {formatDate(data.publicationDate)}</span></div>}
      </header>

      {isPending && <div className="mt-8 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)]"><Skeleton className="h-56 w-full" /><div className="flex flex-col gap-4"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="mt-5 h-7 w-1/2" /><Skeleton className="h-4 w-full" /></div></div>}
      {notPublished && <EmptyState className="mt-8" icon={<FileText className="h-10 w-10" aria-hidden="true" />} title="Documento no disponible" description="No existe una versión vigente disponible para consulta." />}
      {isError && !notPublished && <ErrorState className="mt-8" description={error instanceof ApiError ? error.message : undefined} />}

      {data?.content && (
        <>
          <details className="print-hide mt-7 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 lg:hidden"><summary className="cursor-pointer font-display text-sm font-semibold text-brand-dark">Contenido del documento</summary><ol className="mt-3 flex flex-col gap-2 text-sm text-text-muted">{sections.map((section, sectionIndex) => <li key={section.id}><a href={`#${section.id}`} className="block rounded-lg px-2 py-1 hover:bg-brand-dark-50 hover:text-brand-dark">{sectionIndex + 1}. {section.heading}</a></li>)}</ol></details>
          <div className="mt-8 grid items-start gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="print-hide sticky top-28 hidden rounded-2xl border border-border-soft bg-white p-4 shadow-e2 lg:block"><p className="font-display text-sm font-semibold text-brand-dark">En este documento</p><ol className="mt-3 flex max-h-[calc(100vh-11rem)] flex-col gap-2 overflow-y-auto pr-1 text-xs leading-5 text-text-muted">{sections.map((section, sectionIndex) => <li key={section.id}><a href={`#${section.id}`} className="block rounded-lg border border-transparent px-2 py-1.5 hover:border-border-soft hover:bg-brand-dark-50 hover:text-brand-dark">{sectionIndex + 1}. {section.heading}</a></li>)}</ol></aside>
            <div className="min-w-0 max-w-3xl rounded-3xl border border-border-soft bg-white px-6 py-2 shadow-e2 sm:px-9">
              {sections.map((section, sectionIndex) => <section id={section.id} key={section.id} className="scroll-mt-6 border-b border-border-soft py-7 first:pt-0 last:border-0"><p className="text-xs font-semibold tabular-nums text-brand-orange">{String(sectionIndex + 1).padStart(2, "0")}</p><h2 className="mt-1 font-display text-xl font-semibold text-text-main sm:text-2xl">{section.heading}</h2><p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-text-muted">{section.body}</p></section>)}
            </div>
          </div>

          <nav aria-label="Documentos relacionados" className="print-hide mt-12 border-t border-border-soft pt-7"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-green">Continúa consultando</p><div className="grid gap-4 sm:grid-cols-2">{previous && <Link to={`/legal/${previous.slug}`} className="group rounded-2xl border border-border-soft bg-white p-5 shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e3 motion-reduce:transform-none"><span className="flex items-center gap-2 text-xs font-semibold text-text-muted"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Anterior</span><span className="mt-2 block font-display font-semibold text-brand-dark">{previous.title}</span></Link>}{next && <Link to={`/legal/${next.slug}`} className="group rounded-2xl border border-border-soft bg-white p-5 text-right shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e3 motion-reduce:transform-none"><span className="flex items-center justify-end gap-2 text-xs font-semibold text-text-muted">Siguiente<ArrowRight className="h-4 w-4" aria-hidden="true" /></span><span className="mt-2 block font-display font-semibold text-brand-dark">{next.title}</span></Link>}</div></nav>
        </>
      )}
    </article>
  );
}
