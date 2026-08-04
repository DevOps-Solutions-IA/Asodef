import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, ErrorState, Skeleton, StatusBadge } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { getPaymentOrder } from "../../lib/payments/payments-api";
import { queryKeys } from "../../lib/query-keys";
import { formatCurrency } from "./format-currency";
import { getPaymentOrderStatusTone } from "./payment-order-status-tone";

/** Order statuses still eligible to proceed to the (mock) Bold handoff -
 * mirrors the backend's own NON_PAYABLE_ORDER_STATUSES list (US-025)
 * inverted, so the "Continuar al pago" action is never shown for an
 * order that would just get a 409 from POST /payments/bold/create. */
const PAYABLE_ORDER_STATUSES = new Set(["PENDING", "PROCESSING"]);

export function OrderSummaryPage() {
  const { publicReference } = useParams<{ publicReference: string }>();
  const navigate = useNavigate();

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.paymentOrders.detail(publicReference ?? ""),
    queryFn: () => getPaymentOrder(publicReference!),
    enabled: Boolean(publicReference),
    retry: false,
  });

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
    return <ErrorState description={error instanceof ApiError ? error.message : undefined} />;
  }

  const isPayable = PAYABLE_ORDER_STATUSES.has(data.status);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-brand-dark">Resumen de tu pago</h1>
        <Badge variant="warning">Modo prueba</Badge>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Bold está en modo de prueba - ningún cobro real se realizará en esta sesión de revisión.
      </p>

      <Card className="mt-6">
        <p className="text-sm text-text-muted">Concepto</p>
        <p className="font-display text-lg font-semibold text-text-main">{data.obligation.concept}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-text-muted">Monto</p>
            <p className="font-display text-xl font-semibold text-brand-dark">{formatCurrency(data.amountCents, data.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-text-muted">Fecha límite</p>
            <p className="font-medium text-text-main">{new Date(data.obligation.dueDate).toLocaleDateString("es-CO")}</p>
          </div>
          <div>
            <p className="text-sm text-text-muted">Estado</p>
            <StatusBadge tone={getPaymentOrderStatusTone(data.status)} label={data.statusLabel} />
          </div>
        </div>
      </Card>

      {isPayable ? (
        <div className="mt-6">
          <Button type="button" onClick={() => navigate(`/pagos/procesar/${data.publicReference}`)}>
            Continuar al pago
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-text-muted">
          Esta orden ya no admite un nuevo intento de pago.{" "}
          <Link to="/pagos" className="font-medium text-brand-dark hover:underline">
            Volver al Centro de Pagos
          </Link>
        </p>
      )}
    </div>
  );
}
