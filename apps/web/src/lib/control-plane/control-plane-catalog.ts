import {
  BarChart3,
  Bot,
  BrainCircuit,
  FileClock,
  FileText,
  Gauge,
  Inbox,
  Lightbulb,
  MessagesSquare,
  Network,
  Settings2,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type ControlPlaneArea = "koral" | "comunicaciones";
export type ContractClassification =
  | "MATCHES_CANONICAL"
  | "ADAPTER_REQUIRED"
  | "BACKEND_RUNTIME_MISSING"
  | "BLOCKED_BY_PLANS";

export interface ControlPlaneSectionDefinition {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  capabilities: readonly string[];
}

export const KORAL_SECTIONS: readonly ControlPlaneSectionDefinition[] = [
  {
    slug: "resumen",
    label: "Resumen",
    description:
      "Gobierno, actividad y dependencias de la capa de inteligencia.",
    icon: Gauge,
    capabilities: [
      "Estado operativo",
      "Riesgos y costos",
      "Cambios pendientes",
    ],
  },
  {
    slug: "conversaciones",
    label: "Conversaciones",
    description: "Trazabilidad auditable de interacciones y decisiones de IA.",
    icon: MessagesSquare,
    capabilities: [
      "Búsqueda",
      "Canales normalizados",
      "Consentimiento y PII",
      "Trazas de herramientas",
    ],
  },
  {
    slug: "inbox",
    label: "Inbox",
    description:
      "Colas, asignación y transferencia segura entre Koral y asesores.",
    icon: Inbox,
    capabilities: [
      "Estado de handoff",
      "Prioridad y SLA",
      "Takeover sin colisiones",
      "Notas y etiquetas",
    ],
  },
  {
    slug: "conocimiento",
    label: "Conocimiento",
    description:
      "Fuentes gobernadas, vigencia, permisos y trazabilidad de recuperación.",
    icon: BrainCircuit,
    capabilities: [
      "Fuentes y colecciones",
      "Versionado",
      "Evaluación de recuperación",
    ],
  },
  {
    slug: "agentes",
    label: "Agentes",
    description: "Perfiles de agentes, límites, políticas y evaluaciones.",
    icon: Bot,
    capabilities: ["Instrucciones versionadas", "Permisos", "Evaluaciones"],
  },
  {
    slug: "herramientas",
    label: "Herramientas",
    description:
      "Catálogo del Tool Gateway sin acceso directo a datos o infraestructura.",
    icon: Wrench,
    capabilities: [
      "Esquemas de entrada y salida",
      "RBAC y step-up",
      "Rate limits",
    ],
  },
  {
    slug: "recomendaciones",
    label: "Recomendaciones",
    description:
      "Políticas, evidencia y seguimiento de recomendaciones de Koral.",
    icon: Lightbulb,
    capabilities: [
      "Criterios",
      "Explicabilidad",
      "Resultado y retroalimentación",
    ],
  },
  {
    slug: "automatizaciones",
    label: "Automatizaciones",
    description: "Flujos gobernados con aprobación, límites y recuperación.",
    icon: Network,
    capabilities: [
      "Trigger",
      "Condiciones",
      "Acciones",
      "Versiones",
      "Historial de ejecución",
      "Dead-letter",
    ],
  },
  {
    slug: "analitica",
    label: "Analítica",
    description: "Calidad, seguridad, adopción, latencia y costo de IA.",
    icon: BarChart3,
    capabilities: ["Evaluaciones", "Uso y costo", "Incidentes y tendencias"],
  },
] as const;

export const COMMUNICATION_SECTIONS: readonly ControlPlaneSectionDefinition[] =
  [
    {
      slug: "plantillas",
      label: "Plantillas",
      description:
        "Contenido versionado por canal, finalidad y consentimiento.",
      icon: FileText,
      capabilities: ["Versiones", "Preview por canal", "Variables permitidas"],
    },
    {
      slug: "automatizaciones",
      label: "Automatizaciones",
      description:
        "Reglas funcionales de comunicación separadas del transporte técnico.",
      icon: Sparkles,
      capabilities: [
        "Consentimiento",
        "Frecuencia",
        "Supresión e idempotencia",
      ],
    },
    {
      slug: "historial",
      label: "Historial",
      description:
        "Trazabilidad de intentos y resultados sin revelar contenido sensible.",
      icon: FileClock,
      capabilities: ["Estado", "Canal", "Auditoría sanitizada"],
    },
    {
      slug: "configuracion",
      label: "Configuración funcional",
      description:
        "Preferencias de negocio; la salud de proveedores vive en Sistema.",
      icon: Settings2,
      capabilities: [
        "Finalidades",
        "Ventanas de contacto",
        "Ciclo de publicación",
      ],
    },
  ] as const;

export function getControlPlaneSection(
  area: ControlPlaneArea,
  slug: string | undefined,
): ControlPlaneSectionDefinition | undefined {
  const catalog = area === "koral" ? KORAL_SECTIONS : COMMUNICATION_SECTIONS;
  return catalog.find((section) => section.slug === slug);
}

export function getControlPlanePermission(
  area: ControlPlaneArea,
  slug: string,
): "settings.manage" | "koral.conversations.read" | "knowledge.read" {
  if (area === "koral" && slug === "conocimiento") return "knowledge.read";
  return area === "koral" && (slug === "conversaciones" || slug === "inbox")
    ? "koral.conversations.read"
    : "settings.manage";
}

export function getContractClassification(
  area: ControlPlaneArea,
  slug: string,
): ContractClassification {
  if (area === "koral") {
    if (slug === "conocimiento") return "MATCHES_CANONICAL";
    if (slug === "conversaciones" || slug === "inbox") {
      return "ADAPTER_REQUIRED";
    }
    if (slug === "recomendaciones") {
      return "BACKEND_RUNTIME_MISSING";
    }
  }
  return "BACKEND_RUNTIME_MISSING";
}
