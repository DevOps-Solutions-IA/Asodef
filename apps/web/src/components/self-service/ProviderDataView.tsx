import { Card, StatusBadge } from "@asodef/ui";
import type { ProviderCollection, ProviderPayload } from "../../lib/self-service";

const LABELS: Record<string, string> = {
  id: "Referencia", status: "Estado", state: "Estado", displayName: "Nombre", name: "Nombre", title: "Detalle",
  description: "Descripción", date: "Fecha", createdAt: "Creado", updatedAt: "Actualizado", amount: "Valor",
  reference: "Referencia", relationship: "Parentesco", companyName: "Empresa", planName: "Plan", effectiveDate: "Vigencia",
  balance: "Saldo", cutoffDate: "Fecha de corte", operation: "Operación", reason: "Motivo", type: "Tipo",
};

function readable(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return null;
}

function visibleEntries(record: ProviderPayload) {
  return Object.entries(record)
    .map(([key, value]) => ({ key, label: LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toLocaleUpperCase("es")), value: readable(value) }))
    .filter((entry): entry is { key: string; label: string; value: string } => entry.value !== null)
    .slice(0, 8);
}

export function ProviderRecord({ record }: { record: ProviderPayload }) {
  const entries = visibleEntries(record);
  return (
    <Card className="p-5">
      {entries.length === 0 ? <p className="text-sm text-text-muted">El proveedor no entregó campos públicos para este registro.</p> : (
        <dl className="grid gap-4 sm:grid-cols-2">
          {entries.map(({ key, label, value }) => (
            <div key={key} className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-text-main">
                {key === "status" || key === "state" ? <StatusBadge tone="pending" label={value} /> : value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

export function ProviderDataView({ data }: { data: ProviderPayload | ProviderCollection }) {
  const rows = Array.isArray(data) ? data : [data];
  return <div className="grid gap-4 lg:grid-cols-2">{rows.map((record, index) => <ProviderRecord key={typeof record.id === "string" ? record.id : index} record={record} />)}</div>;
}
