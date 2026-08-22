import type { ReactNode } from "react";
import { Alert, StatusBadge } from "@asodef/ui";
import { ArrowRight, Eye, GitCompare, ShieldCheck } from "lucide-react";
import type { ContractClassification } from "../../../lib/control-plane/control-plane-catalog";

type PublishingState =
  "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED";

const CONFIG_LIFECYCLE: readonly PublishingState[] = [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "RETIRED",
];

const KNOWLEDGE_LIFECYCLE: readonly PublishingState[] = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "RETIRED",
];

const LIFECYCLE_LABELS: Record<PublishingState, string> = {
  DRAFT: "Borrador",
  REVIEW: "Revisión",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  RETIRED: "Retirado",
};

export function BackendDependencyNotice({
  domain,
  classification = "BACKEND_RUNTIME_MISSING",
}: {
  domain: string;
  classification?: ContractClassification;
}) {
  if (classification === "ADAPTER_REQUIRED") {
    return (
      <Alert variant="warning" title="Adaptador al contrato canónico requerido">
        {domain} depende del contrato de conversaciones del Agente 1. La UI
        permanece sin acciones hasta consumir su respuesta canónica y cerrar las
        capacidades faltantes documentadas.
      </Alert>
    );
  }
  if (classification === "BLOCKED_BY_PLANS") {
    return (
      <Alert variant="warning" title="Bloqueado por el contrato de Planes">
        {domain} depende de la fuente única y publicada de Planes. La UI no
        improvisa mappings ni habilita acciones hasta que exista el contrato
        backend canónico aprobado.
      </Alert>
    );
  }
  return (
    <Alert variant="warning" title="Runtime administrativo pendiente">
      {domain} tiene una referencia contractual canónica, pero permanece sin
      acciones hasta que el propietario publique un runtime administrativo
      estable. La UI no inventa endpoints ni permisos.
    </Alert>
  );
}

export function PublishingLifecycle({
  allowRollback = true,
  knowledgeLifecycle = false,
}: {
  allowRollback?: boolean;
  knowledgeLifecycle?: boolean;
}) {
  const lifecycle = knowledgeLifecycle ? KNOWLEDGE_LIFECYCLE : CONFIG_LIFECYCLE;
  return (
    <section
      aria-labelledby="publishing-lifecycle-heading"
      className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="publishing-lifecycle-heading"
            className="font-display text-lg font-semibold text-text-main"
          >
            Gobierno de publicación
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Ninguna configuración llega a producción sin revisión, vista previa,
            diferencias y evento de auditoría.
          </p>
        </div>
        <StatusBadge tone="draft" label="Flujo de publicación" />
      </div>
      <ol
        className="mt-5 grid gap-2 sm:grid-cols-4 xl:grid-cols-5"
        aria-label="Ciclo de publicación"
      >
        {lifecycle.map((state, index) => (
          <li key={state} className="flex min-w-0 items-center gap-2">
            <span className="flex min-h-11 flex-1 items-center rounded-xl border border-brand-dark/10 bg-brand-dark-50 px-3 text-sm font-semibold text-brand-dark">
              {index + 1}.{" "}
              {state === "RETIRED" && allowRollback
                ? "Retirado / reversado"
                : LIFECYCLE_LABELS[state]}
            </span>
            {index < lifecycle.length - 1 && (
              <ArrowRight
                aria-hidden="true"
                className="hidden h-4 w-4 shrink-0 text-text-muted sm:block"
              />
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <GovernanceCheck
          icon={<Eye />}
          title="Vista previa"
          description="Representación final antes de solicitar revisión."
        />
        <GovernanceCheck
          icon={<GitCompare />}
          title="Diferencias"
          description="Cambios semánticos entre la versión vigente y la propuesta."
        />
        <GovernanceCheck
          icon={<ShieldCheck />}
          title="Auditoría"
          description="Actor, motivo, fecha y versiones antes/después."
        />
      </div>
    </section>
  );
}

function GovernanceCheck({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-dark/10 p-4">
      <div className="flex items-center gap-2 text-brand-dark">
        <span aria-hidden="true" className="[&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
    </div>
  );
}

export function CapabilityGrid({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  return (
    <section
      aria-labelledby="capabilities-heading"
      className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"
    >
      <h2
        id="capabilities-heading"
        className="font-display text-lg font-semibold text-text-main"
      >
        Capacidades previstas
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((capability) => (
          <li
            key={capability}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-brand-dark/10 bg-brand-dark-50 px-4 text-sm font-medium text-brand-dark"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-brand-orange"
            />
            {capability}
          </li>
        ))}
      </ul>
    </section>
  );
}
