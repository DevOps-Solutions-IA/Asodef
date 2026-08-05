import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { listBusinessPartners, listCompanies } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

export function CrmCompaniesPage() {
  const companiesQuery = useQuery({ queryKey: queryKeys.admin.crm.companies(), queryFn: ({ signal }) => listCompanies(signal) });
  const partnersQuery = useQuery({ queryKey: queryKeys.admin.crm.partners(), queryFn: ({ signal }) => listBusinessPartners(signal) });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Empresas y aliados" description="Empresas afiliadas y aliados comerciales (business partners)." />

      <section aria-labelledby="companies-heading" className="flex flex-col gap-3">
        <h2 id="companies-heading" className="font-display text-lg font-semibold text-text-main">
          Empresas
        </h2>

        {companiesQuery.isLoading && <Skeleton className="h-32 w-full" />}
        {companiesQuery.isError && (
          <ErrorState description={getAdminErrorMessage(companiesQuery.error)} action={<Button onClick={() => companiesQuery.refetch()}>Reintentar</Button>} />
        )}
        {companiesQuery.isSuccess && companiesQuery.data.length === 0 && (
          <EmptyState title="No hay empresas registradas" description="Las empresas afiliadas aparecerán aquí una vez que se registren." />
        )}

        {companiesQuery.isSuccess && companiesQuery.data.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Lista de empresas</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Empresa
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Sector
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Creada
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {companiesQuery.data.map((company) => (
                  <tr key={company.id} className="hover:bg-bg-soft/60">
                    <td className="px-4 py-3">
                      <Link to={`/admin/crm/empresas/${company.id}`} className="font-medium text-brand-dark hover:underline">
                        {company.name}
                      </Link>
                      <p className="text-xs text-text-muted">{company.nit}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{company.sector}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{company.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(company.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="partners-heading" className="flex flex-col gap-3">
        <h2 id="partners-heading" className="font-display text-lg font-semibold text-text-main">
          Aliados comerciales
        </h2>

        {partnersQuery.isLoading && <Skeleton className="h-32 w-full" />}
        {partnersQuery.isError && (
          <ErrorState description={getAdminErrorMessage(partnersQuery.error)} action={<Button onClick={() => partnersQuery.refetch()}>Reintentar</Button>} />
        )}
        {partnersQuery.isSuccess && partnersQuery.data.length === 0 && (
          <EmptyState title="No hay aliados registrados" description="Los aliados comerciales aparecerán aquí una vez que se registren." />
        )}

        {partnersQuery.isSuccess && partnersQuery.data.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Lista de aliados comerciales</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Aliado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Sector
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Publicación
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Creado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {partnersQuery.data.map((partner) => (
                  <tr key={partner.id} className="hover:bg-bg-soft/60">
                    <td className="px-4 py-3">
                      <Link to={`/admin/crm/aliados/${partner.id}`} className="font-medium text-brand-dark hover:underline">
                        {partner.tradeName}
                      </Link>
                      <p className="text-xs text-text-muted">{partner.nit}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{partner.sector}</td>
                    <td className="px-4 py-3">
                      <Badge variant={partner.publicationStatus === "PUBLISHED" ? "success" : "neutral"}>{partner.publicationStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(partner.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
