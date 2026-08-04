import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, ErrorState, Spinner, StatusBadge } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { createBoldPayment, getBoldPaymentStatus } from "../../lib/payments/payments-api";
import { queryKeys } from "../../lib/query-keys";
import { getPaymentOrderStatusTone } from "./payment-order-status-tone";

/**
 * US-030: automatically triggers POST /payments/bold/create on mount
 * (the "handoff") and renders a clearly-labeled mock confirmation step
 * standing in for the real Bold redirect - this project never redirects
 * to, or collects card data for, a real provider (BOLD_MODE=mock only
 * in Phase 1).
 */
export function PaymentProcessPage() {
  const { publicReference } = useParams<{ publicReference: string }>();
  const navigate = useNavigate();
  // Guards against firing the create call twice (React 18 StrictMode's
  // dev-only double-invocation of effects) - the backend's own
  // database-backed idempotency (US-025) already prevents a duplicate
  // provider call even if this ever did fire twice, but there is no
  // reason to rely on that as the *only* safeguard.
  const hasTriggered = useRef(false);
  const [alreadyProcessed, setAlreadyProcessed] = useState(false);

  const createMutation = useMutation({
    mutationFn: createBoldPayment,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // Order already has a final/in-flight attempt - not a real
        // failure, just means there is nothing new to create; fall back
        // to reading the order's current state instead.
        setAlreadyProcessed(true);
      }
    },
  });

  useEffect(() => {
    if (!publicReference || hasTriggered.current) return;
    hasTriggered.current = true;
    createMutation.mutate(publicReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once per mount, not on every mutate identity change
  }, [publicReference]);

  const statusQuery = useQuery({
    queryKey: queryKeys.boldPayments.status(publicReference ?? ""),
    queryFn: () => getBoldPaymentStatus(publicReference!),
    enabled: alreadyProcessed && Boolean(publicReference),
    retry: false,
  });

  if (!publicReference) {
    return <ErrorState title="Orden no encontrada" />;
  }

  if (createMutation.isError && createMutation.error instanceof ApiError && createMutation.error.kind === "not_found") {
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

  if (alreadyProcessed) {
    if (statusQuery.isPending) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Spinner label="Consultando el estado de tu pago…" />
          <p aria-hidden="true" className="text-sm text-text-muted">
            Consultando el estado de tu pago…
          </p>
        </div>
      );
    }
    if (statusQuery.isError) {
      return <ErrorState description={statusQuery.error instanceof ApiError ? statusQuery.error.message : undefined} />;
    }
    return (
      <MockConfirmation
        publicReference={statusQuery.data.publicReference}
        orderStatus={statusQuery.data.orderStatus}
        orderStatusLabel={statusQuery.data.orderStatusLabel}
      />
    );
  }

  if (createMutation.isError) {
    return (
      <ErrorState
        description={createMutation.error instanceof ApiError ? createMutation.error.message : undefined}
        action={
          <Button type="button" onClick={() => createMutation.mutate(publicReference)}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (!createMutation.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Spinner label="Redirigiendo a Bold (modo prueba)…" />
        <p aria-hidden="true" className="text-sm text-text-muted">
          Redirigiendo a Bold (modo prueba)…
        </p>
      </div>
    );
  }

  return (
    <MockConfirmation
      publicReference={createMutation.data.publicReference}
      orderStatus={createMutation.data.orderStatus}
      orderStatusLabel={createMutation.data.orderStatusLabel}
    />
  );
}

interface MockConfirmationProps {
  publicReference: string;
  orderStatus: string;
  orderStatusLabel: string;
}

function MockConfirmation({ publicReference, orderStatus, orderStatusLabel }: MockConfirmationProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-brand-dark">Simulación de pago Bold</h1>
        <Badge variant="warning">Modo prueba</Badge>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Esta pantalla reemplaza la pasarela real de Bold mientras el sistema opera en modo de prueba - ningún cobro real
        se realizó.
      </p>

      <Card className="mt-6 flex flex-col items-center gap-4 py-10 text-center">
        <StatusBadge tone={getPaymentOrderStatusTone(orderStatus)} label={orderStatusLabel} />
        <p className="text-sm text-text-muted">Referencia: {publicReference}</p>
        <Link to="/pagos" className="font-medium text-brand-dark hover:underline">
          Volver al Centro de Pagos
        </Link>
      </Card>
    </div>
  );
}
