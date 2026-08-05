import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@asodef/ui";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { getMyConsentRecords } from "../../lib/me/me-consent-api";
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

/**
 * US-071: replaces the /mi-cuenta index RoutePlaceholder with a real
 * self-service section - "evidencia de aceptación electrónica" for the
 * titular's own consent history. Scoped entirely server-side to the
 * authenticated actor (GET /me/consent-records never accepts an id) -
 * this page never has to (and never could) ask for anyone else's.
 */
export function MyAccountPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.me.consentRecords(),
    queryFn: ({ signal }) => getMyConsentRecords(signal),
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Mi cuenta</h1>

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold text-text-main">Mis consentimientos</h2>
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
            {data.map((record) => (
              <li
                key={record.id}
                className="flex flex-col gap-1 rounded-xl border border-border-soft bg-white px-4 py-3 text-sm shadow-e1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-text-main">{CONSENT_PURPOSE_LABELS[record.purposeKey] ?? record.purposeKey}</p>
                  <p className="text-xs text-text-muted">
                    {formatDate(record.createdAt)}
                    {record.policyVersionNumber ? ` · Versión ${record.policyVersionNumber}` : ""}
                  </p>
                </div>
                <Badge variant={statusVariant(record.status)}>{CONSENT_STATUS_LABELS[record.status] ?? record.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
