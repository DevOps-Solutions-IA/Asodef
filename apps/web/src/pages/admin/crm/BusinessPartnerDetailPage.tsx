import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Checkbox, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getBusinessPartner, publishBusinessPartner, updateBusinessPartnerChecks } from "../../../lib/admin/admin-crm-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { PARTNER_GATE_CHECKS } from "../../../lib/admin/admin-crm-types";

/** US-061 AC2's "publication-gate checklist from US-053": the same 7-item
 * gate this business partner's own publish() endpoint enforces. */
export function BusinessPartnerDetailPage() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const { hasPermission } = useAuth();
  // partners.manage, not crm.manage - the real permission the underlying
  // mutating endpoints require (see partners.controller.ts).
  const canManage = hasPermission("partners.manage");
  const queryClient = useQueryClient();

  const partnerQuery = useQuery({
    queryKey: queryKeys.admin.crm.partner(partnerId!),
    queryFn: ({ signal }) => getBusinessPartner(partnerId!, signal),
    enabled: !!partnerId,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.partner(partnerId!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.crm.partners() });
  }

  const checksMutation = useMutation({
    mutationFn: (checks: Partial<Record<string, boolean>>) => updateBusinessPartnerChecks(partnerId!, checks),
    onSuccess: invalidate,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishBusinessPartner(partnerId!),
    onSuccess: invalidate,
  });

  if (partnerQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando aliado…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (partnerQuery.isError) {
    return <ErrorState description={getAdminErrorMessage(partnerQuery.error)} action={<Button onClick={() => partnerQuery.refetch()}>Reintentar</Button>} />;
  }

  const partner = partnerQuery.data;
  if (!partner) return null;

  const allChecksConfirmed = PARTNER_GATE_CHECKS.every((check) => Boolean(partner[check.key]));
  const isPublished = partner.publicationStatus === "PUBLISHED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={partner.tradeName} description={`NIT ${partner.nit}`} />

      <section aria-labelledby="partner-benefits-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="partner-benefits-heading" className="font-display text-lg font-semibold text-text-main">
          Beneficios y acuerdo
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Tipo de acuerdo</dt>
            <dd>{partner.agreementType}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Condiciones de descuento</dt>
            <dd>{partner.discountConditions ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Cobertura geográfica</dt>
            <dd>{partner.geographicCoverage ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Estado de publicación</dt>
            <dd>
              <Badge variant={isPublished ? "success" : "neutral"}>{partner.publicationStatus}</Badge>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="partner-checklist-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="partner-checklist-heading" className="font-display text-lg font-semibold text-text-main">
          Lista de verificación de publicación
        </h2>

        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {PARTNER_GATE_CHECKS.map((check) => (
            <li key={check.key}>
              <Checkbox
                label={check.label}
                checked={Boolean(partner[check.key])}
                disabled={!canManage || checksMutation.isPending}
                onChange={(event) => checksMutation.mutate({ [check.key]: event.target.checked })}
              />
            </li>
          ))}
        </ul>
        {checksMutation.isError && <ErrorState description={getAdminErrorMessage(checksMutation.error)} />}

        <div className="mt-5">
          <Button
            type="button"
            disabled={!canManage || !allChecksConfirmed || isPublished || publishMutation.isPending}
            title={!canManage ? "No tienes permiso para publicar aliados." : !allChecksConfirmed ? "Confirma los 7 puntos de la lista antes de publicar." : undefined}
            onClick={() => publishMutation.mutate()}
          >
            {isPublished ? "Publicado" : "Publicar"}
          </Button>
          {publishMutation.isError && <ErrorState description={getAdminErrorMessage(publishMutation.error)} />}
        </div>
      </section>
    </div>
  );
}
