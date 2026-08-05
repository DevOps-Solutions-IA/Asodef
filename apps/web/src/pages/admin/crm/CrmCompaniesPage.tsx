import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Dialog, EmptyState, ErrorState, FormField, Input, PageHeader, Skeleton } from "@asodef/ui";
import { createCompany, listBusinessPartners, listCompanies } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

const createCompanySchema = z.object({
  name: z.string().trim().min(1, "La razón social es requerida."),
  nit: z.string().trim().min(1, "El NIT es requerido."),
  contactName: z.string().trim().min(1, "El nombre de contacto es requerido."),
  contactEmail: z.string().trim().min(1, "El correo de contacto es requerido.").email("Ingresa un correo electrónico válido."),
  sector: z.string().trim().min(1, "El sector es requerido."),
});

type CreateCompanyFormValues = z.infer<typeof createCompanySchema>;

/**
 * US-075: real "Nueva empresa" flow for POST /admin/companies (US-074) -
 * gated by companies.manage (not companies.read, which only unlocks this
 * whole page). A dialog, not a separate route: this page is already the
 * single home for both companies and partners, and creating a company is
 * a short, focused form.
 */
function CreateCompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const errorRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCompanyFormValues>({ resolver: zodResolver(createCompanySchema) });

  const mutation = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.companies() });
      reset();
      onClose();
    },
  });

  useEffect(() => {
    if (mutation.isError) errorRef.current?.focus();
  }, [mutation.isError]);

  const onSubmit = handleSubmit((values) => {
    if (mutation.isPending) return;
    mutation.mutate(values);
  });

  function handleClose() {
    if (mutation.isPending) return;
    reset();
    mutation.reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Nueva empresa" description="Registra una empresa afiliada.">
      {mutation.isError && (
        <div ref={errorRef} tabIndex={-1} className="mb-4 focus:outline-none">
          <Alert variant="danger">{getAdminErrorMessage(mutation.error)}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="Razón social" error={errors.name?.message} required>
          {(controlProps) => <Input {...controlProps} {...register("name")} />}
        </FormField>

        <FormField label="NIT" error={errors.nit?.message} required>
          {(controlProps) => <Input {...controlProps} {...register("nit")} />}
        </FormField>

        <FormField label="Nombre de contacto" error={errors.contactName?.message} required>
          {(controlProps) => <Input {...controlProps} {...register("contactName")} />}
        </FormField>

        <FormField label="Correo de contacto" error={errors.contactEmail?.message} required>
          {(controlProps) => <Input {...controlProps} type="email" {...register("contactEmail")} />}
        </FormField>

        <FormField label="Sector" error={errors.sector?.message} required>
          {(controlProps) => <Input {...controlProps} {...register("sector")} />}
        </FormField>

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
            Crear empresa
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CrmCompaniesPage() {
  const { hasPermission } = useAuth();
  const canManageCompanies = hasPermission("companies.manage");
  const [createOpen, setCreateOpen] = useState(false);

  const companiesQuery = useQuery({ queryKey: queryKeys.admin.crm.companies(), queryFn: ({ signal }) => listCompanies(signal) });
  const partnersQuery = useQuery({ queryKey: queryKeys.admin.crm.partners(), queryFn: ({ signal }) => listBusinessPartners(signal) });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Empresas y aliados" description="Empresas afiliadas y aliados comerciales (business partners)." />

      <section aria-labelledby="companies-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="companies-heading" className="font-display text-lg font-semibold text-text-main">
            Empresas
          </h2>
          {canManageCompanies && (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Nueva empresa
            </Button>
          )}
        </div>

        {companiesQuery.isLoading && <Skeleton className="h-32 w-full" />}
        {companiesQuery.isError && (
          <ErrorState description={getAdminErrorMessage(companiesQuery.error)} action={<Button onClick={() => companiesQuery.refetch()}>Reintentar</Button>} />
        )}
        {companiesQuery.isSuccess && companiesQuery.data.length === 0 && (
          <EmptyState title="No hay empresas registradas" description="Las empresas afiliadas aparecerán aquí una vez que se registren." />
        )}

        {companiesQuery.isSuccess && companiesQuery.data.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Lista de empresas</caption>
              <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
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
                  <tr key={company.id} className="transition-colors duration-150 hover:bg-brand-dark-50/50">
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
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Lista de aliados comerciales</caption>
              <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
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
                  <tr key={partner.id} className="transition-colors duration-150 hover:bg-brand-dark-50/50">
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

      <CreateCompanyDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
