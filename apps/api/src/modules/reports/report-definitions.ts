import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { CsvColumn } from "./csv.util";
import type { ReportFiltersDto, ReportKey } from "./report-filters.dto";

export interface ReportDefinition {
  key: ReportKey;
  label: string;
  columns: CsvColumn[];
  count(prisma: PrismaClient, filters: ReportFiltersDto): Promise<number>;
  fetch(prisma: PrismaClient, filters: ReportFiltersDto, skip: number, take: number): Promise<Array<Record<string, unknown>>>;
}

function dateRange(filters: ReportFiltersDto): Prisma.DateTimeFilter | undefined {
  if (!filters.dateFrom && !filters.dateTo) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) range.gte = new Date(filters.dateFrom);
  if (filters.dateTo) range.lte = new Date(filters.dateTo);
  return range;
}

const paymentsReport: ReportDefinition = {
  key: "payments",
  label: "Pagos por fecha/estado",
  columns: [
    { key: "publicReference", header: "Referencia" },
    { key: "status", header: "Estado" },
    { key: "amountCents", header: "Monto (centavos)" },
    { key: "currency", header: "Moneda" },
    { key: "createdAt", header: "Creada" },
  ],
  count: (prisma, filters) =>
    prisma.paymentOrder.count({ where: { createdAt: dateRange(filters), status: filters.status as never } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.paymentOrder.findMany({
      where: { createdAt: dateRange(filters), status: filters.status as never },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
};

const collectionTotalsReport: ReportDefinition = {
  key: "collection_totals",
  label: "Totales de recaudo",
  columns: [
    { key: "date", header: "Fecha" },
    { key: "totalCents", header: "Total recaudado (centavos)" },
    { key: "orderCount", header: "Órdenes" },
  ],
  // Grouped by day - a raw query since Prisma's groupBy can't truncate a
  // timestamp to a date. Read-only, parameterized (no string interpolation
  // of user input), same pattern as the row-lock raw queries elsewhere.
  count: async (prisma, filters) => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT DATE(created_at)) as count FROM payment_orders
      WHERE status = 'APPROVED'
        ${filters.dateFrom ? Prisma.sql`AND created_at >= ${new Date(filters.dateFrom)}` : Prisma.empty}
        ${filters.dateTo ? Prisma.sql`AND created_at <= ${new Date(filters.dateTo)}` : Prisma.empty}
    `;
    return Number(rows[0]?.count ?? 0);
  },
  fetch: async (prisma, filters, skip, take) => {
    const rows = await prisma.$queryRaw<{ date: Date; totalcents: bigint; ordercount: bigint }[]>`
      SELECT DATE(created_at) as date, SUM(amount_cents) as totalCents, COUNT(*) as orderCount
      FROM payment_orders
      WHERE status = 'APPROVED'
        ${filters.dateFrom ? Prisma.sql`AND created_at >= ${new Date(filters.dateFrom)}` : Prisma.empty}
        ${filters.dateTo ? Prisma.sql`AND created_at <= ${new Date(filters.dateTo)}` : Prisma.empty}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      OFFSET ${skip} LIMIT ${take}
    `;
    return rows.map((row) => ({ date: row.date, totalCents: Number(row.totalcents), orderCount: Number(row.ordercount) }));
  },
};

const outstandingObligationsReport: ReportDefinition = {
  key: "outstanding_obligations",
  label: "Obligaciones pendientes/vencidas",
  columns: [
    { key: "concept", header: "Concepto" },
    { key: "status", header: "Estado" },
    { key: "amountCents", header: "Monto (centavos)" },
    { key: "dueDate", header: "Vencimiento" },
  ],
  count: (prisma, filters) =>
    prisma.obligation.count({ where: { status: (filters.status as never) ?? { in: ["PENDING", "OVERDUE"] }, dueDate: dateRange(filters) } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.obligation.findMany({
      where: { status: (filters.status as never) ?? { in: ["PENDING", "OVERDUE"] }, dueDate: dateRange(filters) },
      orderBy: { dueDate: "asc" },
      skip,
      take,
    }),
};

const transactionsByProviderReport: ReportDefinition = {
  key: "transactions_by_provider",
  label: "Transacciones por proveedor",
  columns: [
    { key: "boldTransactionId", header: "ID de transacción" },
    { key: "status", header: "Estado" },
    { key: "createdAt", header: "Creada" },
  ],
  count: (prisma, filters) => prisma.paymentTransaction.count({ where: { createdAt: dateRange(filters) } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.paymentTransaction.findMany({ where: { createdAt: dateRange(filters) }, orderBy: { createdAt: "desc" }, skip, take }),
};

const refundsReport: ReportDefinition = {
  key: "refunds",
  label: "Reembolsos",
  columns: [
    { key: "paymentOrderId", header: "Orden de pago" },
    { key: "amountCents", header: "Monto (centavos)" },
    { key: "status", header: "Estado" },
    { key: "reason", header: "Motivo" },
    { key: "createdAt", header: "Creado" },
  ],
  count: (prisma, filters) => prisma.refund.count({ where: { createdAt: dateRange(filters), status: filters.status as never } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.refund.findMany({ where: { createdAt: dateRange(filters), status: filters.status as never }, orderBy: { createdAt: "desc" }, skip, take }),
};

const reconciliationDifferencesReport: ReportDefinition = {
  key: "reconciliation_differences",
  label: "Diferencias de conciliación",
  columns: [
    { key: "kind", header: "Tipo" },
    { key: "resolutionStatus", header: "Estado" },
    { key: "paymentOrderId", header: "Orden de pago" },
    { key: "createdAt", header: "Creada" },
  ],
  count: (prisma, filters) =>
    prisma.reconciliationDifference.count({ where: { createdAt: dateRange(filters), resolutionStatus: filters.status as never } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.reconciliationDifference.findMany({
      where: { createdAt: dateRange(filters), resolutionStatus: filters.status as never },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
};

// US-064 AC2's own literal report label bundles "affiliates/beneficiaries/
// companies/partnerships" into one item - "beneficiaries" has no backing
// model anywhere in this codebase (no earlier story ever built one;
// Affiliate/Company/BusinessPartner are the only 3 of the 4 named entities
// that actually exist), so this report covers exactly those 3, each row
// tagged with entityType so a "beneficiaries" gap is visibly absent
// rather than silently invented.
const companiesAndPartnersReport: ReportDefinition = {
  key: "companies_and_partners",
  label: "Afiliados, empresas y aliados",
  columns: [
    { key: "entityType", header: "Tipo" },
    { key: "name", header: "Nombre" },
    { key: "status", header: "Estado" },
    { key: "createdAt", header: "Creado" },
  ],
  count: async (prisma, filters) => {
    const [affiliates, companies, partners] = await Promise.all([
      prisma.affiliate.count({ where: { createdAt: dateRange(filters) } }),
      prisma.company.count({ where: { createdAt: dateRange(filters) } }),
      prisma.businessPartner.count({ where: { createdAt: dateRange(filters) } }),
    ]);
    return affiliates + companies + partners;
  },
  fetch: async (prisma, filters, skip, take) => {
    const [affiliates, companies, partners] = await Promise.all([
      prisma.affiliate.findMany({ where: { createdAt: dateRange(filters) }, include: { customer: { select: { fullName: true } } } }),
      prisma.company.findMany({ where: { createdAt: dateRange(filters) } }),
      prisma.businessPartner.findMany({ where: { createdAt: dateRange(filters) } }),
    ]);
    const rows = [
      ...affiliates.map((a) => ({ entityType: "Afiliado", name: a.customer.fullName, status: a.status, createdAt: a.createdAt })),
      ...companies.map((c) => ({ entityType: "Empresa", name: c.name, status: c.status, createdAt: c.createdAt })),
      ...partners.map((p) => ({ entityType: "Aliado", name: p.tradeName, status: p.status, createdAt: p.createdAt })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows.slice(skip, skip + take);
  },
};

const contractExpirationReport: ReportDefinition = {
  key: "contract_expiration",
  label: "Vencimiento de contratos",
  columns: [
    { key: "type", header: "Tipo" },
    { key: "internalReference", header: "Referencia interna" },
    { key: "status", header: "Estado" },
    { key: "expirationDate", header: "Vencimiento" },
  ],
  count: (prisma, filters) => prisma.contract.count({ where: { expirationDate: dateRange(filters), status: filters.status as never } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.contract.findMany({ where: { expirationDate: dateRange(filters), status: filters.status as never }, orderBy: { expirationDate: "asc" }, skip, take }),
};

const userActivityReport: ReportDefinition = {
  key: "user_activity",
  label: "Actividad de usuarios",
  columns: [
    { key: "type", header: "Tipo" },
    { key: "userId", header: "Usuario" },
    { key: "ipAddress", header: "IP" },
    { key: "createdAt", header: "Fecha" },
  ],
  count: (prisma, filters) => prisma.securityEvent.count({ where: { createdAt: dateRange(filters) } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.securityEvent.findMany({ where: { createdAt: dateRange(filters) }, orderBy: { createdAt: "desc" }, skip, take }),
};

const auditEventsReport: ReportDefinition = {
  key: "audit_events",
  label: "Eventos de auditoría",
  columns: [
    { key: "action", header: "Acción" },
    { key: "actorUserId", header: "Usuario" },
    { key: "applied", header: "Aplicado" },
    { key: "createdAt", header: "Fecha" },
  ],
  count: (prisma, filters) => prisma.auditLog.count({ where: { createdAt: dateRange(filters) } }),
  fetch: (prisma, filters, skip, take) =>
    prisma.auditLog.findMany({ where: { createdAt: dateRange(filters) }, orderBy: { createdAt: "desc" }, skip, take }),
};

export const REPORT_DEFINITIONS: Record<ReportKey, ReportDefinition> = {
  payments: paymentsReport,
  collection_totals: collectionTotalsReport,
  outstanding_obligations: outstandingObligationsReport,
  transactions_by_provider: transactionsByProviderReport,
  refunds: refundsReport,
  reconciliation_differences: reconciliationDifferencesReport,
  companies_and_partners: companiesAndPartnersReport,
  contract_expiration: contractExpirationReport,
  user_activity: userActivityReport,
  audit_events: auditEventsReport,
};
