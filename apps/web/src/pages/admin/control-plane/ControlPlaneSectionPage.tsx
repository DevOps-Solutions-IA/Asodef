import { Alert, EmptyState, PageHeader, StatusBadge } from "@asodef/ui";
import { Bot, Braces, LockKeyhole, ServerOff } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  getContractClassification,
  getControlPlaneSection,
  type ControlPlaneArea,
} from "../../../lib/control-plane/control-plane-catalog";
import {
  BackendDependencyNotice,
  CapabilityGrid,
  PublishingLifecycle,
} from "./ControlPlaneFoundation";
import { InboxOwnershipGuard } from "./InboxOwnershipGuard";

export function ControlPlaneSectionPage({
  area,
  section: explicitSection,
}: {
  area: ControlPlaneArea;
  section?: string;
}) {
  const { sectionSlug } = useParams();
  const resolvedSlug = explicitSection ?? sectionSlug;
  const section = getControlPlaneSection(area, resolvedSlug);

  if (!section) {
    return (
      <EmptyState
        icon={<ServerOff className="h-6 w-6" />}
        title="Sección no disponible"
        description="La ruta solicitada no forma parte del contrato del Control Plane."
        titleAs="h1"
      />
    );
  }

  const Icon = section.icon;
  const isKoral = area === "koral";
  const classification = getContractClassification(area, section.slug);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          isKoral
            ? "Koral · Control Plane"
            : "Comunicaciones · Gobierno funcional"
        }
        title={section.label}
        description={section.description}
        icon={<Icon aria-hidden="true" className="h-5 w-5" />}
        actions={
          <StatusBadge
            tone={classification === "BLOCKED_BY_PLANS" ? "failed" : "inactive"}
            label={dependencyStatusLabel(classification)}
          />
        }
      />
      <BackendDependencyNotice
        domain={section.label}
        classification={classification}
      />
      <CapabilityGrid capabilities={section.capabilities} />
      {(section.slug === "conversaciones" || section.slug === "inbox") && (
        <Alert variant="warning" title="Handoff UNAVAILABLE en esta UI">
          El backend canónico conserva el estado y la versión de la
          conversación, pero su respuesta aún no está conectada a esta vista.
          Cuando el backend indique atención humana activa, la interfaz no
          presentará a Koral como si estuviera atendiendo el caso.
        </Alert>
      )}
      {section.slug === "inbox" && (
        <section aria-labelledby="inbox-safety-heading" className="space-y-3">
          <h2
            id="inbox-safety-heading"
            className="font-display text-lg font-semibold text-text-main"
          >
            Protección de asignación
          </h2>
          <InboxOwnershipGuard
            ownership={null}
            currentActorId=""
            contractAvailable={false}
          />
          <p className="text-xs text-text-muted">
            El contrato exige colas, prioridad, SLA, estado IA/Humano, notas,
            etiquetas, takeover, returnToKoral y control optimista de versión.
          </p>
        </section>
      )}
      {section.slug === "agentes" && <ModelProfileFoundation />}
      {area === "koral" && section.slug === "automatizaciones" && (
        <Alert variant="warning" title="Automation runtime NOT_CONFIGURED">
          Los contratos de trigger, condiciones, acciones, versiones, historial
          y dead-letter están integrados. Ejecutar, activar, reintentar o
          reprocesar permanece deshabilitado hasta contar con runtime canónico.
        </Alert>
      )}
      {area === "comunicaciones" && (
        <Alert variant="warning" title="Communications runtime NOT_CONFIGURED">
          Los contratos canónicos están integrados, pero no existe runtime de
          envío administrativo. Esta vista no envía mensajes ni interpreta una
          configuración SMTP como entrega disponible.
        </Alert>
      )}
      {(section.slug === "conocimiento" ||
        section.slug === "automatizaciones" ||
        area === "comunicaciones") && (
        <PublishingLifecycle
          knowledgeLifecycle={section.slug === "conocimiento"}
        />
      )}
    </div>
  );
}

function ModelProfileFoundation() {
  return (
    <section
      aria-labelledby="model-profile-heading"
      className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="model-profile-heading"
            className="font-display text-lg font-semibold text-text-main"
          >
            Perfiles de modelo
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Selección administrable de modelos a través de OpenRouter, sin
            exponer credenciales ni permitir acceso directo a datos.
          </p>
        </div>
        <StatusBadge tone="inactive" label="NOT_CONFIGURED" />
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ModelField
          icon={<Bot />}
          term="Identidad"
          detail="Proveedor, modelo y versión"
        />
        <ModelField
          icon={<Braces />}
          term="Parámetros"
          detail="Límites y configuración evaluable"
        />
        <ModelField
          icon={<LockKeyhole />}
          term="Gobierno"
          detail="Permisos, PII y herramientas"
        />
        <ModelField
          icon={<ServerOff />}
          term="Credenciales"
          detail="Nunca renderizadas en el cliente"
        />
      </dl>
    </section>
  );
}

function dependencyStatusLabel(
  classification: ReturnType<typeof getContractClassification>,
): string {
  if (classification === "ADAPTER_REQUIRED") return "UNAVAILABLE";
  if (classification === "BLOCKED_BY_PLANS") return "BLOCKED";
  if (classification === "MATCHES_CANONICAL") return "AVAILABLE";
  return "NOT_CONFIGURED";
}

function ModelField({
  icon,
  term,
  detail,
}: {
  icon: React.ReactNode;
  term: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-dark/10 p-4">
      <dt className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
        <span aria-hidden="true" className="[&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        {term}
      </dt>
      <dd className="mt-1 text-xs leading-5 text-text-muted">{detail}</dd>
    </div>
  );
}
