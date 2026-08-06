import { BENEFITS } from "../../../lib/public-content/benefits";
import { PUBLIC_ROUTES } from "../../../lib/public-content/public-routes";

export type VerifiedMetricId = "benefit-categories" | "published-legal-documents" | "specialized-public-workflows";

export interface VerifiedPublicMetric {
  id: VerifiedMetricId;
  value: number;
  label: string;
  context: string;
  source: {
    kind: "code-registry" | "verified-database-snapshot";
    path: string;
    derivation: string;
  };
}

const SPECIALIZED_PUBLIC_WORKFLOWS = [PUBLIC_ROUTES.payments.path, PUBLIC_ROUTES.pqr.path, PUBLIC_ROUTES.dsr.path, PUBLIC_ROUTES.start.path] as const;

/**
 * Only finite, deterministic and reviewable figures belong here. Never add
 * customer, transaction, satisfaction or coverage totals without a real
 * authoritative source and its public-use authorization.
 */
export const VERIFIED_PUBLIC_METRICS = [
  {
    id: "benefit-categories",
    value: BENEFITS.length,
    label: "categorías de beneficios",
    context: "Cada categoría tiene una página con proceso, alcance y fuentes.",
    source: {
      kind: "code-registry",
      path: "apps/web/src/lib/public-content/benefits.ts",
      derivation: "Longitud del registro canónico BENEFITS.",
    },
  },
  {
    id: "published-legal-documents",
    value: 21,
    label: "documentos institucionales publicados",
    context: "Versiones vigentes disponibles en el Centro Legal.",
    source: {
      kind: "verified-database-snapshot",
      path: "database:LegalDocument.currentVersionId",
      derivation: "Verificación de base de datos al inicio y cierre de la fase: 21 de 21 documentos institucionales con versión vigente PUBLISHED.",
    },
  },
  {
    id: "specialized-public-workflows",
    value: SPECIALIZED_PUBLIC_WORKFLOWS.length,
    label: "gestiones públicas",
    context: "Pagos, PQR, datos personales y orientación guiada.",
    source: {
      kind: "code-registry",
      path: "apps/web/src/lib/public-content/public-routes.ts",
      derivation: `Conteo de rutas funcionales: ${SPECIALIZED_PUBLIC_WORKFLOWS.join(", ")}.`,
    },
  },
] as const satisfies readonly VerifiedPublicMetric[];

export function getVerifiedPublicMetric(id: VerifiedMetricId) {
  return VERIFIED_PUBLIC_METRICS.find((metric) => metric.id === id);
}
