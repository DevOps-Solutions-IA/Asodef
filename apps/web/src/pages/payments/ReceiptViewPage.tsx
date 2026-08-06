import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, Skeleton } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { BrandLogo } from "../../layouts/shared/BrandLogo";
import { getReceipt, getReceiptDownloadUrl } from "../../lib/payments/payments-api";
import { queryKeys } from "../../lib/query-keys";
import { formatCurrency } from "./format-currency";
import { BadgeCheck, Download, ReceiptText } from "lucide-react";

const LINK_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center rounded-full bg-brand-dark px-5 text-sm font-medium text-white transition-colors hover:bg-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2";

export function ReceiptViewPage() {
  const { publicReference } = useParams<{ publicReference: string }>();

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.receipts.detail(publicReference ?? ""),
    queryFn: () => getReceipt(publicReference!),
    enabled: Boolean(publicReference),
    retry: false,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.kind === "not_found") {
      // Same generic message whether the reference doesn't exist or the
      // order simply has no receipt yet (not APPROVED) - matches the
      // backend's own anti-enumeration convention (US-024/US-027): no
      // information leakage about why, just "there is nothing here".
      return (
        <ErrorState
          title="Comprobante no disponible"
          description="Este pago no tiene un comprobante disponible. Verifica el enlace o consulta el estado de tu pago en el Centro de Pagos."
        />
      );
    }
    return <ErrorState description={error instanceof ApiError ? error.message : undefined} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><BrandLogo variant="compact" className="h-8 w-auto" /><h1 className="mt-4 flex items-center gap-2 font-display text-2xl font-semibold text-brand-dark"><ReceiptText aria-hidden="true" className="h-6 w-6 text-brand-orange" /> Comprobante de pago</h1><p className="mt-1 text-sm text-text-muted">{data.statusLabel}</p></div>
        <span className="inline-flex self-start items-center gap-2 rounded-full border border-brand-green/20 bg-brand-green/10 px-3 py-1.5 text-xs font-semibold text-brand-green sm:self-auto"><BadgeCheck aria-hidden="true" className="h-4 w-4" /> Documento verificable</span>
      </header>

      <Card variant="accent" className="mt-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-text-muted">No. de comprobante</dt>
            <dd className="font-medium text-text-main">{data.receiptNumber}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Código de verificación</dt>
            <dd className="font-medium text-text-main">{data.verificationCode}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Referencia</dt>
            <dd className="font-medium text-text-main">{data.publicReference}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Fecha de emisión</dt>
            <dd className="font-medium text-text-main">{new Date(data.issuedAt).toLocaleDateString("es-CO")}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Cliente</dt>
            <dd className="font-medium text-text-main">
              {data.customerFullName} ({data.maskedDocumentNumber})
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Concepto</dt>
            <dd className="font-medium text-text-main">{data.concept}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Monto</dt>
            <dd className="font-display text-lg font-semibold tabular-nums text-brand-dark">{formatCurrency(data.amountCents, data.currency)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <a href={getReceiptDownloadUrl(data.publicReference)} className={LINK_BUTTON_CLASS}>
            <Download aria-hidden="true" className="mr-2 h-4 w-4" /> Descargar PDF
          </a>
        </div>
      </Card>
    </div>
  );
}
