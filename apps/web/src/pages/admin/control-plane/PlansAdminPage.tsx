import { EmptyState, PageHeader, StatusBadge } from "@asodef/ui";
import { Layers3, ServerOff } from "lucide-react";
import {
  BackendDependencyNotice,
  PublishingLifecycle,
} from "./ControlPlaneFoundation";

const PLAN_FIELDS = [
  "code",
  "name",
  "description",
  "features",
  "benefits",
  "eligibility",
  "pricing",
  "currency",
  "billingPeriod",
  "commercialText",
  "terms",
  "status",
  "publicVisibility",
  "koralVisibility",
  "recommended",
  "displayOrder",
  "effectiveFrom",
  "effectiveTo",
  "version",
] as const;

export function PlansAdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión · Fuente comercial única"
        title="Planes"
        description="Administración versionada para que la experiencia pública y Koral consuman la misma versión publicada."
        icon={<Layers3 aria-hidden="true" className="h-5 w-5" />}
        actions={<StatusBadge tone="inactive" label="Backend bloqueado" />}
      />
      <BackendDependencyNotice domain="Planes" />
      <EmptyState
        icon={<ServerOff className="h-6 w-6" />}
        title="Fuente administrativa aún no conectada"
        description="No se muestran planes de demostración ni se habilita publicación hasta recibir el contrato backend canónico y auditable."
        titleAs="h2"
      />
      <section
        aria-labelledby="plan-schema-heading"
        className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"
      >
        <h2
          id="plan-schema-heading"
          className="font-display text-lg font-semibold text-text-main"
        >
          Campos requeridos por el Control Plane
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Requisitos de consumo pendientes del contrato canónico; no son una
          copia del modelo backend ni representan datos almacenados en el
          navegador.
        </p>
        <ul
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Campos del contrato de planes"
        >
          {PLAN_FIELDS.map((field) => (
            <li
              key={field}
              className="rounded-full border border-brand-dark/10 bg-brand-dark-50 px-3 py-1.5 font-mono text-xs text-brand-dark"
            >
              {field}
            </li>
          ))}
        </ul>
      </section>
      <PublishingLifecycle allowRollback={false} />
    </div>
  );
}
