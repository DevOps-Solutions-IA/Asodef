import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, EmptyState, ErrorState, FormField, Input, PageHeader, Skeleton, Textarea } from "@asodef/ui";
import { approveRefund, getPaymentOrder, listPaymentEvents, listRefundsForOrder, requestRefund } from "../../../lib/admin/admin-payments-api";
import { getReceiptDownloadUrl } from "../../../lib/payments/payments-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { REFUND_STATUS_LABELS } from "../../../lib/admin/admin-payments-types";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * US-063 AC1/AC4/AC5: full PaymentEvent history, receipt download,
 * initiate/approve refunds with required reason. AC5's negative case:
 * a payments.read-only actor sees the refund action disabled with a
 * tooltip, not hidden.
 */
export function PaymentOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { hasPermission } = useAuth();
  const canRequestRefund = hasPermission("payments.refund");
  const canApproveRefund = hasPermission("payments.refund.approve");
  const queryClient = useQueryClient();

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const orderQuery = useQuery({
    queryKey: queryKeys.admin.payments.order(orderId!),
    queryFn: ({ signal }) => getPaymentOrder(orderId!, signal),
    enabled: !!orderId,
  });
  const eventsQuery = useQuery({
    queryKey: queryKeys.admin.payments.events(orderId!),
    queryFn: ({ signal }) => listPaymentEvents(orderId!, signal),
    enabled: !!orderId,
  });
  const refundsQuery = useQuery({
    queryKey: queryKeys.admin.payments.refunds(orderId!),
    queryFn: ({ signal }) => listRefundsForOrder(orderId!, signal),
    enabled: !!orderId,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payments.order(orderId!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.payments.refunds(orderId!) });
  }

  const requestRefundMutation = useMutation({
    mutationFn: () => requestRefund(orderQuery.data!.publicReference, Number(refundAmount), refundReason),
    onSuccess: () => {
      invalidate();
      setRefundDialogOpen(false);
      setRefundAmount("");
      setRefundReason("");
    },
  });

  const approveRefundMutation = useMutation({
    mutationFn: (refundId: string) => approveRefund(refundId),
    onSuccess: invalidate,
  });

  if (orderQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando orden…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (orderQuery.isError) {
    return <ErrorState description={getAdminErrorMessage(orderQuery.error)} action={<Button onClick={() => orderQuery.refetch()}>Reintentar</Button>} />;
  }

  const order = orderQuery.data;
  if (!order) return null;

  const canRequestNewRefund = canRequestRefund && order.status === "APPROVED";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={order.customer.fullName}
        description={`${order.publicReference} · ${order.obligation.concept}`}
        actions={
          <a href={getReceiptDownloadUrl(order.publicReference)} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline">
              Descargar recibo
            </Button>
          </a>
        }
      />

      <section aria-labelledby="order-summary-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="order-summary-heading" className="font-display text-lg font-semibold text-text-main">
          Resumen
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Estado</dt>
            <dd>
              <Badge variant={order.status === "REFUNDED" || order.status === "APPROVED" ? "success" : "neutral"}>{order.statusLabel}</Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Monto</dt>
            <dd>{formatMoney(order.amountCents, order.currency)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Documento del cliente</dt>
            <dd>
              {order.customer.documentType} {order.customer.documentNumber}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <Button
            type="button"
            disabled={!canRequestNewRefund || requestRefundMutation.isPending}
            title={
              !canRequestRefund
                ? "No tienes permiso para solicitar reembolsos."
                : order.status !== "APPROVED"
                  ? "Solo se pueden solicitar reembolsos para órdenes aprobadas."
                  : undefined
            }
            onClick={() => setRefundDialogOpen(true)}
          >
            Iniciar reembolso
          </Button>
        </div>
      </section>

      <section aria-labelledby="refunds-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="refunds-heading" className="font-display text-lg font-semibold text-text-main">
          Reembolsos
        </h2>

        {refundsQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {refundsQuery.isError && <ErrorState description={getAdminErrorMessage(refundsQuery.error)} />}
        {refundsQuery.isSuccess && refundsQuery.data.length === 0 && <EmptyState title="Sin reembolsos" description="Esta orden no tiene reembolsos registrados." />}

        {refundsQuery.isSuccess && refundsQuery.data.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {refundsQuery.data.map((refund) => (
              <li key={refund.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-soft p-3">
                <div>
                  <p className="font-medium text-text-main">{formatMoney(refund.amountCents, order.currency)}</p>
                  <p className="text-text-muted">{refund.reason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={refund.status === "APPROVED" ? "success" : "neutral"}>{REFUND_STATUS_LABELS[refund.status] ?? refund.status}</Badge>
                  {refund.status === "PENDING_APPROVAL" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canApproveRefund || approveRefundMutation.isPending}
                      title={!canApproveRefund ? "No tienes permiso para aprobar reembolsos." : undefined}
                      onClick={() => approveRefundMutation.mutate(refund.id)}
                    >
                      Aprobar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {approveRefundMutation.isError && <ErrorState description={getAdminErrorMessage(approveRefundMutation.error)} />}
      </section>

      <section aria-labelledby="events-heading" className="rounded-2xl border border-border-soft p-5">
        <h2 id="events-heading" className="font-display text-lg font-semibold text-text-main">
          Historial de eventos
        </h2>

        {eventsQuery.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
        {eventsQuery.isError && <ErrorState description={getAdminErrorMessage(eventsQuery.error)} />}
        {eventsQuery.isSuccess && eventsQuery.data.length === 0 && <EmptyState title="Sin eventos" description="No se han recibido eventos para esta orden." />}

        {eventsQuery.isSuccess && eventsQuery.data.length > 0 && (
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {eventsQuery.data.map((event) => (
              <li key={event.id} className="rounded-xl border border-border-soft p-3">
                <p className="font-medium text-text-main">
                  {event.source} · {event.eventType}
                </p>
                <p className="text-text-muted">{formatDateTime(event.receivedAt)}</p>
                {!event.processedAt && <Badge variant="warning">Sin procesar</Badge>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Dialog open={refundDialogOpen} onClose={() => setRefundDialogOpen(false)} title="Iniciar reembolso" description="El monto y el motivo son requeridos.">
        <div className="flex flex-col gap-4">
          <FormField label="Monto (centavos COP)" required>
            {(controlProps) => <Input {...controlProps} type="number" min={1} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} />}
          </FormField>
          <div>
            <label htmlFor="refund-reason" className="mb-1.5 block text-sm font-medium text-text-main">
              Motivo
            </label>
            <Textarea id="refund-reason" required rows={3} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
          </div>
          {requestRefundMutation.isError && <ErrorState description={getAdminErrorMessage(requestRefundMutation.error)} />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setRefundDialogOpen(false)} disabled={requestRefundMutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              loading={requestRefundMutation.isPending}
              disabled={!refundAmount || !refundReason.trim()}
              onClick={() => requestRefundMutation.mutate()}
            >
              Solicitar reembolso
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
