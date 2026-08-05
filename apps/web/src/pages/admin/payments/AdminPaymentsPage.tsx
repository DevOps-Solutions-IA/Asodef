import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton } from "@asodef/ui";
import { searchPaymentOrders } from "../../../lib/admin/admin-payments-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { PAYMENT_ORDER_STATUSES } from "../../../lib/admin/admin-payments-types";

const PAGE_SIZE = 20;

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

/** US-063 AC1: "/admin/pagos supports search by document/reference/
 * transaction, status filtering". */
export function AdminPaymentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const filters = { search: search.trim() || undefined, status: status || undefined, page, pageSize: PAGE_SIZE };
  const query = useQuery({ queryKey: queryKeys.admin.payments.search(filters), queryFn: ({ signal }) => searchPaymentOrders(filters, signal) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pagos" description="Búsqueda de órdenes de pago por documento, referencia o transacción." />

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <div className="min-w-[260px] flex-1">
          <label htmlFor="payments-search" className="mb-1.5 block text-sm font-medium text-text-main">
            Buscar
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              id="payments-search"
              type="search"
              placeholder="Documento, referencia o transacción"
              className="pl-10"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div>
          <label htmlFor="payments-status-filter" className="mb-1.5 block text-sm font-medium text-text-main">
            Estado
          </label>
          <Select
            id="payments-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {PAYMENT_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </form>

      {query.isLoading && <Skeleton className="h-64 w-full" />}
      {query.isError && <ErrorState description={getAdminErrorMessage(query.error)} action={<Button onClick={() => query.refetch()}>Reintentar</Button>} />}
      {query.isSuccess && query.data.items.length === 0 && <EmptyState title="No hay órdenes que coincidan" description="Ajusta la búsqueda o los filtros." />}

      {query.isSuccess && query.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Órdenes de pago</caption>
              <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Referencia
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Monto
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Creada
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {query.data.items.map((order) => (
                  <tr key={order.id} className="transition-colors duration-150 hover:bg-brand-dark-50/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/pagos/${order.id}`} className="font-medium text-brand-dark hover:underline">
                        {order.customer.fullName}
                      </Link>
                      <p className="text-xs text-text-muted">{order.customer.documentNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{order.publicReference}</td>
                    <td className="px-4 py-3 text-text-muted">{formatMoney(order.amountCents, order.currency)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={order.status === "REFUNDED" || order.status === "APPROVED" ? "success" : "neutral"}>{order.statusLabel}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
