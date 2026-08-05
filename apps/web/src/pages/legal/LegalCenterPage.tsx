import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Badge, Input } from "@asodef/ui";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { LEGAL_CATALOG } from "../../lib/legal/legal-catalog";
import { queryKeys } from "../../lib/query-keys";

/**
 * US-045: /legal index - all 12 known categories always render (AC
 * negative case: before any document is published, every category shows
 * "aún no publicado" without erroring), each independently queried so one
 * slow/failed lookup never blocks the others. Search/filter is purely
 * client-side over the static catalog's titles (US-045 AC: "simple
 * client-side search/filter across document titles").
 */
export function LegalCenterPage() {
  const [search, setSearch] = useState("");

  const results = useQueries({
    queries: LEGAL_CATALOG.map((entry) => ({
      queryKey: queryKeys.legalDocuments.detail(entry.slug),
      queryFn: () => getPublicLegalDocument(entry.slug),
      retry: false,
    })),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return LEGAL_CATALOG;
    return LEGAL_CATALOG.filter((entry) => entry.title.toLowerCase().includes(query));
  }, [search]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Centro legal</h1>
      <p className="mt-1 text-sm text-text-muted">
        Consulta las políticas y documentos legales publicados de {"ASODEF S.A.S."}.
      </p>

      <div className="mt-6 max-w-sm">
        <label htmlFor="legal-search" className="sr-only">
          Buscar documento legal
        </label>
        <Input
          id="legal-search"
          type="search"
          placeholder="Buscar por título…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <ul className="mt-6 flex flex-col gap-2">
        {filtered.map((entry) => {
          const index = LEGAL_CATALOG.indexOf(entry);
          const result = results[index];
          const isPublished = result?.isSuccess && Boolean(result.data.content);

          return (
            <li key={entry.slug}>
              <Link
                to={`/legal/${entry.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-white px-4 py-3 text-sm shadow-e1 transition-shadow duration-150 hover:shadow-e2"
              >
                <span className="font-medium text-text-main">{entry.title}</span>
                {isPublished ? (
                  <Badge variant="success">Publicado</Badge>
                ) : result?.isPending ? null : (
                  <Badge variant="neutral">Aún no publicado</Badge>
                )}
              </Link>
            </li>
          );
        })}

        {filtered.length === 0 && <p className="text-sm text-text-muted">No encontramos documentos con ese título.</p>}
      </ul>
    </div>
  );
}
