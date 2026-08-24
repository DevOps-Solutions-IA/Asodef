import { EmptyState, PageHeader, StatusBadge } from "@asodef/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers3, RefreshCw } from "lucide-react";
import { getAdminPlans } from "../../../lib/admin/admin-plans-api";

export function PlansAdminPage() {
  const query = useQuery({ queryKey: ["admin", "plans"], queryFn: ({ signal }) => getAdminPlans(signal) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión · Fuente comercial única"
        title="Planes"
        description="Versiones comerciales canónicas compartidas por Admin, el sitio público, Koral, CRM y contratos. Los estados legacy se conservan sin convertirlos automáticamente."
        icon={<Layers3 aria-hidden="true" className="h-5 w-5" />}
        actions={<StatusBadge tone="success" label="Backend canónico" />}
      />

      {query.isPending ? (
        <section aria-live="polite" aria-busy="true" className="rounded-xl3 border border-border-soft bg-white p-6 text-sm text-text-muted">Cargando planes…</section>
      ) : query.isError ? (
        <section role="alert" className="rounded-xl3 border border-danger/30 bg-white p-6">
          <div className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle aria-hidden="true" className="h-5 w-5" />No fue posible consultar la fuente canónica.</div>
          <button type="button" onClick={() => void query.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"><RefreshCw aria-hidden="true" className="h-4 w-4" />Reintentar</button>
        </section>
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Layers3 className="h-6 w-6" />} title="Aún no hay planes" description="La fuente canónica respondió correctamente y no contiene aggregates. No se muestran datos de demostración." titleAs="h2" />
      ) : (
        <section aria-labelledby="plans-list-heading" className="overflow-hidden rounded-xl3 border border-border-soft bg-white shadow-e1">
          <h2 id="plans-list-heading" className="px-5 pt-5 font-display text-lg font-semibold text-text-main">Catálogo administrativo</h2>
          <div className="overflow-x-auto">
            <table className="mt-3 min-w-full text-left text-sm">
              <thead className="border-y border-border-soft bg-surface-subtle text-text-muted"><tr><th scope="col" className="px-5 py-3">Código</th><th scope="col" className="px-5 py-3">Plan</th><th scope="col" className="px-5 py-3">Versión vigente</th><th scope="col" className="px-5 py-3">Histórico</th></tr></thead>
              <tbody className="divide-y divide-border-soft">
                {query.data.map((plan) => {
                  const current = plan.versions.find((version) => version.planVersionId === plan.currentVersionId);
                  return (
                    <tr key={plan.id}>
                      <td className="px-5 py-4 font-mono text-xs">{plan.code ?? "LEGACY / SIN CÓDIGO"}</td>
                      <td className="px-5 py-4 font-semibold text-text-main">{plan.name}</td>
                      <td className="px-5 py-4">{current ? `v${current.version} · ${current.status}` : "Sin versión publicada"}</td>
                      <td className="px-5 py-4">{plan.versions.length} {plan.versions.length === 1 ? "versión" : "versiones"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
