import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { queryKeys } from "../../lib/query-keys";

export interface LegalDocumentPageProps {
  slug: string;
  title: string;
}

/**
 * US-045: one component for all 12 /legal/* subpages, driven by the
 * slug/title the router passes in from LEGAL_CATALOG - the page heading
 * always renders (from the known catalog title), independent of whether
 * the document has been published yet, so the page never looks broken
 * while legal review is still in progress.
 */
export function LegalDocumentPage({ slug, title }: LegalDocumentPageProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.legalDocuments.detail(slug),
    queryFn: () => getPublicLegalDocument(slug),
    retry: false,
  });

  const notPublished = isError && error instanceof ApiError && error.kind === "not_found";

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">{title}</h1>

      {isPending && (
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {notPublished && (
        <EmptyState
          className="mt-6"
          icon={<FileText className="h-10 w-10" aria-hidden="true" />}
          title="Aún no publicado"
          description="Este documento está en revisión legal y todavía no ha sido publicado. Vuelve a consultarlo más adelante."
        />
      )}

      {isError && !notPublished && (
        <ErrorState className="mt-6" description={error instanceof ApiError ? error.message : undefined} />
      )}

      {data?.content && (
        <div className="mt-6 flex flex-col gap-8">
          {data.content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-lg font-semibold text-text-main">{section.heading}</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-text-muted">{section.body}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
