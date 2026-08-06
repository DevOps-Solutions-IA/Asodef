import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ASODEF_COMPANY } from "@asodef/config";
import { Button, Card, ErrorState, Skeleton, StatusBadge } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { getBoldPaymentStatus, getReceiptDownloadUrl } from "../../lib/payments/payments-api";
import { queryKeys } from "../../lib/query-keys";
import { PAYMENT_RESULT_CONFIG, toPaymentResultState } from "./payment-result-state";
import { CheckCircle2, Clock3, ReceiptText, ShieldAlert } from "lucide-react";

const LINK_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center rounded-full bg-brand-dark px-5 text-sm font-medium text-white transition-colors hover:bg-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2";

export function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference");
  const navigate = useNavigate();

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.boldPayments.status(reference ?? ""),
    queryFn: () => getBoldPaymentStatus(reference!),
    enabled: Boolean(reference),
    retry: false,
  });

  if (!reference) {
    return (
      <ErrorState
        title="No se indicó un pago"
        description="Inicia una nueva búsqueda desde el Centro de Pagos."
        action={
          <Button type="button" onClick={() => navigate("/pagos")}>
            Ir al Centro de Pagos
          </Button>
        }
      />
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.kind === "not_found") {
      return (
        <ErrorState
          title="Orden no encontrada"
          description="Verifica el enlace o inicia una nueva búsqueda en el Centro de Pagos."
          action={
            <Button type="button" onClick={() => navigate("/pagos")}>
              Volver al Centro de Pagos
            </Button>
          }
        />
      );
    }
    // A raw ApiError.message is already a safe, translated string
    // (never the provider's own error text, a stack trace, or an
    // internal service name - see lib/api-error.ts's SAFE_MESSAGES).
    return <ErrorState description={error instanceof ApiError ? error.message : undefined} />;
  }

  const state = toPaymentResultState(data.orderStatus);
  const config = PAYMENT_RESULT_CONFIG[state];
  const ResultIcon = state === "approved" ? CheckCircle2 : state === "pending" ? Clock3 : ShieldAlert;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">{config.heading}</h1>
      <p className="mt-1 text-sm text-text-muted">{config.description}</p>

      <Card variant="accent" className="mt-6 flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-dark-50 text-brand-dark ring-1 ring-brand-dark/10"><ResultIcon aria-hidden="true" className="h-8 w-8" /></span>
        <StatusBadge tone={config.tone} label={data.orderStatusLabel} />
        <p className="inline-flex items-center gap-2 rounded-full bg-bg-soft px-3 py-1.5 text-sm text-text-muted"><ReceiptText aria-hidden="true" className="h-4 w-4" /> Referencia: {data.publicReference}</p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {state === "approved" && (
            <a href={getReceiptDownloadUrl(data.publicReference)} className={LINK_BUTTON_CLASS}>
              Descargar comprobante
            </a>
          )}

          {state === "pending" && (
            <Button type="button" loading={isFetching} onClick={() => refetch()}>
              Actualizar estado
            </Button>
          )}

          {(state === "rejected" || state === "failed") && (
            <>
              {/* A REJECTED/FAILED order can never accept a new Bold
                  attempt itself (the backend's own NON_PAYABLE_ORDER_
                  STATUSES list blocks it with 409) - "retry" always
                  means a genuinely new order for the same obligation,
                  starting from the lookup screen, never resubmitting
                  this exact order (satisfies the AC's "does not imply
                  the customer was charged twice"). */}
              <Button type="button" onClick={() => navigate("/pagos")}>
                Reintentar
              </Button>
              <a href={ASODEF_COMPANY.commercialContact.whatsappUrl} target="_blank" rel="noreferrer" className={LINK_BUTTON_CLASS}>
                Contactar soporte
              </a>
            </>
          )}

          {state === "expired" && (
            <Button type="button" onClick={() => navigate("/pagos")}>
              Iniciar un nuevo pago
            </Button>
          )}
        </div>

        <Link to="/pagos" className="text-sm font-medium text-brand-dark hover:underline">
          Volver al Centro de Pagos
        </Link>
      </Card>
    </div>
  );
}
