import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from "@asodef/ui";
import { createOpportunity, listLeads, listProspects, promoteLead } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "../../../lib/admin/admin-crm-types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

export function ProspectsListPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("crm.manage");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [promotingLeadId, setPromotingLeadId] = useState<string | null>(null);
  const [documentOrNit, setDocumentOrNit] = useState("");

  const prospectsQuery = useQuery({ queryKey: queryKeys.admin.crm.prospects(), queryFn: ({ signal }) => listProspects(signal) });
  const leadsQuery = useQuery({ queryKey: queryKeys.admin.crm.leads(), queryFn: ({ signal }) => listLeads(signal) });

  const promoteMutation = useMutation({
    mutationFn: (leadId: string) => promoteLead(leadId, { type: "COMPANY", documentOrNit }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.prospects() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.leads() });
      setPromotingLeadId(null);
      setDocumentOrNit("");
    },
  });

  const createOpportunityMutation = useMutation({
    mutationFn: (prospectId: string) => createOpportunity(prospectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.opportunities() });
    },
  });

  const searchLower = search.trim().toLowerCase();
  const filteredProspects = (prospectsQuery.data ?? []).filter((prospect) => {
    if (stageFilter && prospect.stage !== stageFilter) return false;
    if (!searchLower) return true;
    return prospect.fullNameOrLegalName.toLowerCase().includes(searchLower) || prospect.documentOrNit.toLowerCase().includes(searchLower);
  });

  const filteredLeads = (leadsQuery.data ?? []).filter((lead) => {
    if (!searchLower) return true;
    return lead.fullName.toLowerCase().includes(searchLower) || lead.company.toLowerCase().includes(searchLower);
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Prospectos" description="Prospectos calificados y formularios de contacto (leads) pendientes de promover." />

      <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
        <div className="min-w-[220px] flex-1">
          <label htmlFor="crm-search" className="mb-1.5 block text-sm font-medium text-text-main">
            Buscar
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input id="crm-search" type="search" placeholder="Nombre, empresa o documento" className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="crm-stage-filter" className="mb-1.5 block text-sm font-medium text-text-main">
            Etapa (prospectos)
          </label>
          <Select id="crm-stage-filter" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="">Todas</option>
            {(Object.keys(PIPELINE_STAGE_LABELS) as PipelineStage[]).map((stage) => (
              <option key={stage} value={stage}>
                {PIPELINE_STAGE_LABELS[stage]}
              </option>
            ))}
          </Select>
        </div>
      </form>

      <section aria-labelledby="prospects-heading" className="flex flex-col gap-3">
        <h2 id="prospects-heading" className="font-display text-lg font-semibold text-text-main">
          Prospectos
        </h2>

        {prospectsQuery.isLoading && <Skeleton className="h-32 w-full" />}
        {prospectsQuery.isError && (
          <ErrorState description={getAdminErrorMessage(prospectsQuery.error)} action={<Button onClick={() => prospectsQuery.refetch()}>Reintentar</Button>} />
        )}
        {prospectsQuery.isSuccess && filteredProspects.length === 0 && <EmptyState title="No hay prospectos que coincidan" description="Ajusta la búsqueda o los filtros." />}

        {prospectsQuery.isSuccess && filteredProspects.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Lista de prospectos</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Prospecto
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Etapa
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Sector
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Creado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredProspects.map((prospect) => (
                  <tr key={prospect.id} className="hover:bg-bg-soft/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-main">{prospect.fullNameOrLegalName}</p>
                      <p className="text-xs text-text-muted">{prospect.documentOrNit}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{PIPELINE_STAGE_LABELS[prospect.stage as PipelineStage] ?? prospect.stage}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{prospect.sector ?? "—"}</td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(prospect.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canManage || createOpportunityMutation.isPending}
                        title={!canManage ? "No tienes permiso para crear oportunidades." : undefined}
                        onClick={() => createOpportunityMutation.mutate(prospect.id)}
                      >
                        Crear oportunidad
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {createOpportunityMutation.isError && <ErrorState description={getAdminErrorMessage(createOpportunityMutation.error)} />}
      </section>

      <section aria-labelledby="leads-heading" className="flex flex-col gap-3">
        <h2 id="leads-heading" className="font-display text-lg font-semibold text-text-main">
          Formularios de contacto (leads)
        </h2>

        {leadsQuery.isLoading && <Skeleton className="h-32 w-full" />}
        {leadsQuery.isError && <ErrorState description={getAdminErrorMessage(leadsQuery.error)} action={<Button onClick={() => leadsQuery.refetch()}>Reintentar</Button>} />}
        {leadsQuery.isSuccess && filteredLeads.length === 0 && <EmptyState title="No hay leads que coincidan" description="Ajusta la búsqueda." />}

        {leadsQuery.isSuccess && filteredLeads.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Lista de leads</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Contacto
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Empresa
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Creado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-bg-soft/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-main">{lead.fullName}</p>
                      <p className="text-xs text-text-muted">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{lead.company}</td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(lead.createdAt)}</td>
                    <td className="px-4 py-3">
                      {lead.prospectId ? (
                        <Badge variant="success">Promovido</Badge>
                      ) : promotingLeadId === lead.id ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            promoteMutation.mutate(lead.id);
                          }}
                        >
                          <label className="sr-only" htmlFor={`document-or-nit-${lead.id}`}>
                            Documento o NIT
                          </label>
                          <Input
                            id={`document-or-nit-${lead.id}`}
                            className="w-36"
                            placeholder="Documento o NIT"
                            required
                            value={documentOrNit}
                            onChange={(event) => setDocumentOrNit(event.target.value)}
                          />
                          <Button type="submit" size="sm" disabled={promoteMutation.isPending}>
                            Confirmar
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setPromotingLeadId(null)}>
                            Cancelar
                          </Button>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          title={!canManage ? "No tienes permiso para promover leads." : undefined}
                          onClick={() => setPromotingLeadId(lead.id)}
                        >
                          Promover a prospecto
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {promoteMutation.isError && <ErrorState description={getAdminErrorMessage(promoteMutation.error)} />}
      </section>
    </div>
  );
}
