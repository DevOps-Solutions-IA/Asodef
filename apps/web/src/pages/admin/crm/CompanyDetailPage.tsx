import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getCompany, listCompanyContacts, listCompanySites } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";

export function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();

  const companyQuery = useQuery({
    queryKey: queryKeys.admin.crm.company(companyId!),
    queryFn: ({ signal }) => getCompany(companyId!, signal),
    enabled: !!companyId,
  });
  const contactsQuery = useQuery({ queryKey: queryKeys.admin.crm.companyContacts(companyId!), queryFn: ({ signal }) => listCompanyContacts(companyId!, signal), enabled: !!companyId });
  const sitesQuery = useQuery({ queryKey: queryKeys.admin.crm.companySites(companyId!), queryFn: ({ signal }) => listCompanySites(companyId!, signal), enabled: !!companyId });

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

      <section aria-labelledby="company-contacts-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="company-contacts-heading" className="font-display text-lg font-semibold text-text-main">Contactos</h2>
        {contactsQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {contactsQuery.isError && <ErrorState description={getAdminErrorMessage(contactsQuery.error)} action={<Button onClick={() => contactsQuery.refetch()}>Reintentar</Button>} />}
        {contactsQuery.isSuccess && contactsQuery.data.length === 0 && <EmptyState title="Sin contactos adicionales" description="La empresa aún no tiene contactos comerciales estructurados." />}
        {contactsQuery.isSuccess && contactsQuery.data.length > 0 && (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {contactsQuery.data.map((contact) => <li key={contact.id} className="rounded-xl bg-bg-soft p-3 text-sm"><p className="font-medium text-text-main">{contact.fullName} {contact.isPrimary && <Badge variant="success">Principal</Badge>}</p><p className="text-text-muted">{contact.role ?? "Sin cargo"}</p><p className="break-words text-text-muted">{contact.email ?? contact.phone}</p></li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="company-sites-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="company-sites-heading" className="font-display text-lg font-semibold text-text-main">Sedes</h2>
        {sitesQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {sitesQuery.isError && <ErrorState description={getAdminErrorMessage(sitesQuery.error)} action={<Button onClick={() => sitesQuery.refetch()}>Reintentar</Button>} />}
        {sitesQuery.isSuccess && sitesQuery.data.length === 0 && <EmptyState title="Sin sedes registradas" description="Las sedes de la empresa aparecerán aquí." />}
        {sitesQuery.isSuccess && sitesQuery.data.length > 0 && (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {sitesQuery.data.map((site) => <li key={site.id} className="rounded-xl bg-bg-soft p-3 text-sm"><p className="font-medium text-text-main">{site.name} {site.isPrimary && <Badge variant="success">Principal</Badge>}</p><p className="text-text-muted">{site.address}</p><p className="text-text-muted">{site.city}{site.phone ? ` · ${site.phone}` : ""}</p></li>)}
          </ul>
        )}
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
