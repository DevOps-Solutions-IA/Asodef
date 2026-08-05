import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getCompany } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";

export function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();

  const companyQuery = useQuery({
    queryKey: queryKeys.admin.crm.company(companyId!),
    queryFn: ({ signal }) => getCompany(companyId!, signal),
    enabled: !!companyId,
  });

  if (companyQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando empresa…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (companyQuery.isError) {
    return <ErrorState description={getAdminErrorMessage(companyQuery.error)} action={<Button onClick={() => companyQuery.refetch()}>Reintentar</Button>} />;
  }

  const company = companyQuery.data;
  if (!company) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={company.name} description={`NIT ${company.nit}`} />

      <section aria-labelledby="company-profile-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="company-profile-heading" className="font-display text-lg font-semibold text-text-main">
          Perfil
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Estado</dt>
            <dd>
              <Badge variant="neutral">{company.status}</Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Sector</dt>
            <dd>{company.sector}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Contacto</dt>
            <dd>
              {company.contactName} · {company.contactEmail}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="company-related-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="company-related-heading" className="font-display text-lg font-semibold text-text-main">
          Registros relacionados
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Oportunidades</dt>
            <dd>{company.opportunityCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Acuerdos</dt>
            <dd>{company.agreementCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Contratos</dt>
            <dd>{company.contractCount}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
