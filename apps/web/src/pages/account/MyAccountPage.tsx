import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { getMyConsentRecords, revokeMyConsent } from "../../lib/me/me-consent-api";
import { CONSENT_PURPOSE_LABELS, CONSENT_STATUS_LABELS } from "../../lib/me/me-consent-types";
import { queryKeys } from "../../lib/query-keys";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-CO", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusVariant(status: string): "success" | "danger" | "neutral" {
  if (status === "GRANTED") return "success";
  if (status === "REVOKED" || status === "DENIED") return "danger";
  return "neutral";
}

// US-073: only these two purposes are unilaterally revocable - matches
// ConsentService's own REVOCABLE_PURPOSE_KEYS server-side. Everything
// else (terms, data processing, payment terms, contract acceptance) is
// a condition of service, not shown with a revoke action here.
const REVOCABLE_PURPOSE_KEYS = new Set(["commercial_communications", "optional_marketing"]);

/**
 * US-071/US-073: replaces the /mi-cuenta index RoutePlaceholder with a
 * real self-service section - "evidencia de aceptación electrónica" for
 * the titular's own consent history, plus self-service revocation for
 * commercial consents. Scoped entirely server-side to the authenticated
 * actor (GET/POST /me/consent-records never accept an id) - this page
 * never has to (and never could) act on anyone else's.
 */
export function MyAccountPage() {
  const queryClient = useQueryClient();
  const [purposeToRevoke, setPurposeToRevoke] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.me.consentRecords(),
    queryFn: ({ signal }) => getMyConsentRecords(signal),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeMyConsent,
    onSuccess: () => {
      setPurposeToRevoke(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.consentRecords() });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Portal personal" icon={<ShieldCheck className="h-5 w-5" />} title="Mi cuenta" description="Consulta y administra la evidencia asociada a tus consentimientos en ASODEF." />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border-soft bg-white p-3 text-sm shadow-e1">
        <Link to="/legal/terminos-y-condiciones" className="font-medium text-brand-dark hover:underline">Términos de uso</Link>
        <Link to="/legal/politica-de-privacidad" className="font-medium text-brand-dark hover:underline">Política de privacidad</Link>
        <Link to="/legal/condiciones-portal-afiliado" className="font-medium text-brand-dark hover:underline">Condiciones del portal</Link>
      </div>

      <Card>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-main"><FileCheck2 aria-hidden="true" className="h-5 w-5 text-brand-orange" /> Mis consentimientos</h2>
        <p className="mt-1 text-sm text-text-muted">Historial de los consentimientos que has otorgado o revocado en ASODEF.</p>

        {isPending && (
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {isError && (
          <ErrorState className="mt-4" description={getAdminErrorMessage(error)} action={<Button onClick={() => refetch()}>Reintentar</Button>} />
        )}

        {data && data.length === 0 && (
          <EmptyState className="mt-4" title="Sin registros" description="Aún no tienes consentimientos registrados." />
        )}

        {data && data.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {data.map((record) => {
              const canRevoke = REVOCABLE_PURPOSE_KEYS.has(record.purposeKey) && record.status === "GRANTED";
              return (
                <li
                  key={record.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm shadow-e1 transition-shadow hover:shadow-e2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-text-main">{CONSENT_PURPOSE_LABELS[record.purposeKey] ?? record.purposeKey}</p>
                    <p className="text-xs text-text-muted">
                      {formatDate(record.createdAt)}
                      {record.policyVersionNumber ? ` · Versión ${record.policyVersionNumber}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusVariant(record.status)}>{CONSENT_STATUS_LABELS[record.status] ?? record.status}</Badge>
                    {canRevoke && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setPurposeToRevoke(record.purposeKey)}>
                        Revocar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog
        open={purposeToRevoke !== null}
        onClose={() => setPurposeToRevoke(null)}
        title="Revocar consentimiento"
        description="Dejarás de recibir comunicaciones de este tipo. Las comunicaciones transaccionales (pagos, comprobantes) no se ven afectadas."
      >
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => setPurposeToRevoke(null)} disabled={revokeMutation.isPending}>
            Cancelar
          </Button>
          <Button type="button" loading={revokeMutation.isPending} onClick={() => purposeToRevoke && revokeMutation.mutate(purposeToRevoke)}>
            Confirmar revocación
          </Button>
        </div>
        {revokeMutation.isError && <ErrorState className="mt-3" description={getAdminErrorMessage(revokeMutation.error)} />}
      </Dialog>
    </div>
  );
}
