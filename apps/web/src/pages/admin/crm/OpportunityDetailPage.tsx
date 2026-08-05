import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, FormField, Input, PageHeader, Select, Skeleton } from "@asodef/ui";
import {
  completeActivity,
  createAgreement,
  createProposal,
  getOpportunity,
  listAgreements,
  listOpportunityActivities,
  listOpportunityStatusHistory,
  listProposals,
  scheduleActivity,
} from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "../../../lib/admin/admin-crm-types";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = { CALL: "Llamada", MEETING: "Reunión", EMAIL: "Correo", TASK: "Tarea" };

export function OpportunityDetailPage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("crm.manage");
  const queryClient = useQueryClient();

  const [activityType, setActivityType] = useState<"CALL" | "MEETING" | "EMAIL" | "TASK">("CALL");
  const [activityNote, setActivityNote] = useState("");
  const [proposalBenefit, setProposalBenefit] = useState("");
  const [proposalPriceCents, setProposalPriceCents] = useState("");
  const [agreementCompanyId, setAgreementCompanyId] = useState("");

  const opportunityQuery = useQuery({
    queryKey: queryKeys.admin.crm.opportunity(opportunityId!),
    queryFn: ({ signal }) => getOpportunity(opportunityId!, signal),
    enabled: !!opportunityId,
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.admin.crm.statusHistory(opportunityId!),
    queryFn: ({ signal }) => listOpportunityStatusHistory(opportunityId!, signal),
    enabled: !!opportunityId,
  });
  const activitiesQuery = useQuery({
    queryKey: queryKeys.admin.crm.activities(opportunityId!),
    queryFn: ({ signal }) => listOpportunityActivities(opportunityId!, signal),
    enabled: !!opportunityId,
  });
  const proposalsQuery = useQuery({
    queryKey: queryKeys.admin.crm.proposals(opportunityId!),
    queryFn: ({ signal }) => listProposals(opportunityId!, signal),
    enabled: !!opportunityId,
  });
  const agreementsQuery = useQuery({
    queryKey: queryKeys.admin.crm.agreements(opportunityId!),
    queryFn: ({ signal }) => listAgreements(opportunityId!, signal),
    enabled: !!opportunityId,
  });

  const scheduleActivityMutation = useMutation({
    mutationFn: () => scheduleActivity(opportunityId!, { type: activityType, note: activityNote || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.activities(opportunityId!) });
      setActivityNote("");
    },
  });

  const completeActivityMutation = useMutation({
    mutationFn: (activityId: string) => completeActivity(activityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.activities(opportunityId!) });
    },
  });

  const createProposalMutation = useMutation({
    mutationFn: () => createProposal(opportunityId!, { benefit: proposalBenefit, priceCents: Number(proposalPriceCents) || 0 }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.proposals(opportunityId!) });
      setProposalBenefit("");
      setProposalPriceCents("");
    },
  });

  const createAgreementMutation = useMutation({
    mutationFn: () => createAgreement(opportunityId!, agreementCompanyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.agreements(opportunityId!) });
      setAgreementCompanyId("");
    },
  });

  if (opportunityQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando oportunidad…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (opportunityQuery.isError) {
    return <ErrorState description={getAdminErrorMessage(opportunityQuery.error)} action={<Button onClick={() => opportunityQuery.refetch()}>Reintentar</Button>} />;
  }

  const opportunity = opportunityQuery.data;
  if (!opportunity) return null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={opportunity.proposedBenefit ?? `Oportunidad ${opportunity.id.slice(0, 8)}`}
        description={`Etapa actual: ${PIPELINE_STAGE_LABELS[opportunity.stage as PipelineStage] ?? opportunity.stage}`}
      />

      <section aria-labelledby="activities-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="activities-heading" className="font-display text-lg font-semibold text-text-main">
          Actividades y notas
        </h2>

        {activitiesQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {activitiesQuery.isError && <ErrorState description={getAdminErrorMessage(activitiesQuery.error)} />}
        {activitiesQuery.isSuccess && activitiesQuery.data.length === 0 && <EmptyState title="Sin actividades registradas" description="Aún no se ha programado ninguna actividad." />}

        {activitiesQuery.isSuccess && activitiesQuery.data.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {activitiesQuery.data.map((activity) => (
              <li key={activity.id} className="flex items-start justify-between gap-3 rounded-xl border border-border-soft p-3">
                <div>
                  <p className="font-medium text-text-main">
                    {ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type} · {formatDateTime(activity.createdAt)}
                  </p>
                  {activity.note && <p className="mt-1 text-text-muted">{activity.note}</p>}
                </div>
                {activity.completedAt ? (
                  <Badge variant="success">Completada</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canManage || completeActivityMutation.isPending}
                    title={!canManage ? "No tienes permiso para completar actividades." : undefined}
                    onClick={() => completeActivityMutation.mutate(activity.id)}
                  >
                    Completar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            scheduleActivityMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="activity-type" className="mb-1.5 block text-sm font-medium text-text-main">
              Tipo
            </label>
            <Select id="activity-type" value={activityType} onChange={(event) => setActivityType(event.target.value as typeof activityType)} disabled={!canManage}>
              <option value="CALL">Llamada</option>
              <option value="MEETING">Reunión</option>
              <option value="EMAIL">Correo</option>
              <option value="TASK">Tarea</option>
            </Select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label htmlFor="activity-note" className="mb-1.5 block text-sm font-medium text-text-main">
              Nota
            </label>
            <Input id="activity-note" value={activityNote} onChange={(event) => setActivityNote(event.target.value)} disabled={!canManage} />
          </div>
          <Button type="submit" disabled={!canManage || scheduleActivityMutation.isPending} title={!canManage ? "No tienes permiso para programar actividades." : undefined}>
            Programar actividad
          </Button>
        </form>
        {scheduleActivityMutation.isError && <ErrorState description={getAdminErrorMessage(scheduleActivityMutation.error)} />}
      </section>

      <section aria-labelledby="proposals-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="proposals-heading" className="font-display text-lg font-semibold text-text-main">
          Versiones de propuesta
        </h2>

        {proposalsQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {proposalsQuery.isError && <ErrorState description={getAdminErrorMessage(proposalsQuery.error)} />}
        {proposalsQuery.isSuccess && proposalsQuery.data.length === 0 && <EmptyState title="Sin propuestas" description="Aún no se ha creado ninguna propuesta." />}

        {proposalsQuery.isSuccess && proposalsQuery.data.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {proposalsQuery.data.map((proposal) => (
              <li key={proposal.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-soft p-3">
                <span>
                  Versión {proposal.version} · {formatDateTime(proposal.createdAt)}
                </span>
                {proposal.isCurrent && <Badge variant="success">Vigente</Badge>}
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            createProposalMutation.mutate();
          }}
        >
          <FormField label="Beneficio propuesto" required>
            {(controlProps) => <Input {...controlProps} value={proposalBenefit} onChange={(event) => setProposalBenefit(event.target.value)} disabled={!canManage} />}
          </FormField>
          <FormField label="Precio (COP centavos)">
            {(controlProps) => (
              <Input {...controlProps} type="number" min={0} value={proposalPriceCents} onChange={(event) => setProposalPriceCents(event.target.value)} disabled={!canManage} />
            )}
          </FormField>
          <Button type="submit" disabled={!canManage || createProposalMutation.isPending} title={!canManage ? "No tienes permiso para crear propuestas." : undefined}>
            Crear propuesta
          </Button>
        </form>
        {createProposalMutation.isError && <ErrorState description={getAdminErrorMessage(createProposalMutation.error)} />}
      </section>

      <section aria-labelledby="agreements-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="agreements-heading" className="font-display text-lg font-semibold text-text-main">
          Acuerdos
        </h2>

        {agreementsQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {agreementsQuery.isError && <ErrorState description={getAdminErrorMessage(agreementsQuery.error)} />}
        {agreementsQuery.isSuccess && agreementsQuery.data.length === 0 && <EmptyState title="Sin acuerdos" description="Aún no se ha creado ningún acuerdo para esta oportunidad." />}

        {agreementsQuery.isSuccess && agreementsQuery.data.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {agreementsQuery.data.map((agreement) => (
              <li key={agreement.id} className="rounded-xl border border-border-soft p-3">
                Empresa {agreement.companyId} · {agreement.status ?? "Sin estado"} · {formatDateTime(agreement.createdAt)}
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            createAgreementMutation.mutate();
          }}
        >
          <FormField label="ID de empresa" required>
            {(controlProps) => <Input {...controlProps} value={agreementCompanyId} onChange={(event) => setAgreementCompanyId(event.target.value)} disabled={!canManage} />}
          </FormField>
          <Button type="submit" disabled={!canManage || createAgreementMutation.isPending} title={!canManage ? "No tienes permiso para crear acuerdos." : undefined}>
            Crear acuerdo
          </Button>
        </form>
        {createAgreementMutation.isError && <ErrorState description={getAdminErrorMessage(createAgreementMutation.error)} />}
      </section>

      <section aria-labelledby="history-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="history-heading" className="font-display text-lg font-semibold text-text-main">
          Historial completo de estados
        </h2>

        {historyQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {historyQuery.isError && <ErrorState description={getAdminErrorMessage(historyQuery.error)} />}
        {historyQuery.isSuccess && historyQuery.data.length === 0 && <EmptyState title="Sin historial" description="Esta oportunidad no ha cambiado de etapa todavía." />}

        {historyQuery.isSuccess && historyQuery.data.length > 0 && (
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {historyQuery.data.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border-soft p-3">
                <p className="font-medium text-text-main">
                  {entry.fromStage ? (PIPELINE_STAGE_LABELS[entry.fromStage as PipelineStage] ?? entry.fromStage) : "—"} →{" "}
                  {PIPELINE_STAGE_LABELS[entry.toStage as PipelineStage] ?? entry.toStage}
                </p>
                <p className="text-text-muted">{formatDateTime(entry.createdAt)}</p>
                {entry.note && <p className="mt-1 text-text-muted">{entry.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
