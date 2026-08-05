import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, ErrorState, PageHeader, Select, Skeleton } from "@asodef/ui";
import { changeOpportunityStage, listOpportunities } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, type PipelineStage } from "../../../lib/admin/admin-crm-types";

function formatMoney(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);
}

/**
 * US-061 AC2: "renders a pipeline board across the 14 stages with
 * drag-or-click stage transitions calling the real API." Implemented as
 * click (a Select per card), not drag-and-drop - the AC's own "or"
 * explicitly allows either, and click is far more robust/accessible than
 * HTML5 drag-and-drop (which is also notoriously hard to test reliably).
 */
export function OpportunitiesBoardPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("crm.manage");
  const queryClient = useQueryClient();

  const opportunitiesQuery = useQuery({ queryKey: queryKeys.admin.crm.opportunities(), queryFn: ({ signal }) => listOpportunities(signal) });

  const stageMutation = useMutation({
    mutationFn: ({ opportunityId, stage }: { opportunityId: string; stage: string }) => changeOpportunityStage(opportunityId, stage),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.opportunities() });
    },
  });

  if (opportunitiesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Oportunidades" description="Tablero del embudo comercial." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (opportunitiesQuery.isError) {
    return <ErrorState description={getAdminErrorMessage(opportunitiesQuery.error)} action={<Button onClick={() => opportunitiesQuery.refetch()}>Reintentar</Button>} />;
  }

  const opportunities = opportunitiesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Oportunidades" description="Tablero del embudo comercial, agrupado por etapa." />

      {stageMutation.isSuccess && stageMutation.data.warning && (
        <Alert variant="warning">{stageMutation.data.warning}</Alert>
      )}
      {stageMutation.isError && <ErrorState description={getAdminErrorMessage(stageMutation.error)} />}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const stageOpportunities = opportunities.filter((opportunity) => opportunity.stage === stage);
          return (
            <div key={stage} className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-border-soft bg-bg-soft/40 p-3">
              <h2 className="flex items-center justify-between text-sm font-semibold text-text-main">
                {PIPELINE_STAGE_LABELS[stage]}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-text-muted">{stageOpportunities.length}</span>
              </h2>

              <div className="flex flex-col gap-2">
                {stageOpportunities.map((opportunity) => (
                  <article key={opportunity.id} className="rounded-xl border border-border-soft bg-white p-3 text-sm">
                    <Link to={`/admin/crm/oportunidades/${opportunity.id}`} className="font-medium text-brand-dark hover:underline">
                      {opportunity.proposedBenefit ?? `Oportunidad ${opportunity.id.slice(0, 8)}`}
                    </Link>
                    <p className="mt-1 text-xs text-text-muted">{formatMoney(opportunity.estimatedValueCents)}</p>

                    <label className="sr-only" htmlFor={`stage-select-${opportunity.id}`}>
                      Cambiar etapa de {opportunity.id}
                    </label>
                    <Select
                      id={`stage-select-${opportunity.id}`}
                      className="mt-2 text-xs"
                      value={opportunity.stage}
                      disabled={!canManage || stageMutation.isPending}
                      title={!canManage ? "No tienes permiso para cambiar la etapa." : undefined}
                      onChange={(event) => {
                        const nextStage = event.target.value as PipelineStage;
                        if (nextStage !== opportunity.stage) {
                          stageMutation.mutate({ opportunityId: opportunity.id, stage: nextStage });
                        }
                      }}
                    >
                      {PIPELINE_STAGES.map((option) => (
                        <option key={option} value={option}>
                          {PIPELINE_STAGE_LABELS[option]}
                        </option>
                      ))}
                    </Select>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
