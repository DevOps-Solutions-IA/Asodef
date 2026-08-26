import { Alert, EmptyState, PageHeader, StatusBadge } from "@asodef/ui";
import { ServerOff } from "lucide-react";
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

  // Every production Koral route is wired directly to a runtime-backed page
  // in router.tsx. The generic foundation remains only for Communications,
  // whose pages are not part of the Koral navigation contract.
  if (!section || area === "koral") {
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
  const classification = getContractClassification(area, section.slug);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comunicaciones · Gobierno funcional"
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
      <Alert variant="warning" title="Communications runtime NOT_CONFIGURED">
        Los contratos canónicos están integrados, pero no existe runtime de
        envío administrativo. Esta vista no envía mensajes ni interpreta una
        configuración SMTP como entrega disponible.
      </Alert>
      <PublishingLifecycle knowledgeLifecycle={false} />
    </div>
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
