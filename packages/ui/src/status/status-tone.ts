/**
 * Generic, cross-cutting status vocabulary. Domain-specific status enums
 * (payment status, contract status, PQR status, business-partner status,
 * etc., defined in their own later stories) each translate their own
 * values to one of these tones + a domain-specific Spanish label, so the
 * *visual treatment* (color, dot) is defined exactly once here rather than
 * being re-invented per page. StatusBadge consumes this map directly.
 */
export type StatusTone =
  | "success"
  | "pending"
  | "processing"
  | "warning"
  | "rejected"
  | "failed"
  | "expired"
  | "cancelled"
  | "draft"
  | "active"
  | "inactive"
  | "under_review";

export interface StatusToneConfig {
  label: string;
  className: string;
}

export const STATUS_TONE_CONFIG: Record<StatusTone, StatusToneConfig> = {
  success: { label: "Exitoso", className: "bg-success/10 text-success" },
  active: { label: "Activo", className: "bg-success/10 text-success" },
  pending: { label: "Pendiente", className: "bg-warning/10 text-warning" },
  under_review: { label: "En revisión", className: "bg-info/10 text-info" },
  processing: { label: "Procesando", className: "bg-info/10 text-info" },
  warning: { label: "Atención", className: "bg-warning/10 text-warning" },
  rejected: { label: "Rechazado", className: "bg-danger/10 text-danger" },
  failed: { label: "Fallido", className: "bg-danger/10 text-danger" },
  cancelled: { label: "Cancelado", className: "bg-danger/10 text-danger" },
  expired: { label: "Vencido", className: "bg-bg-soft text-text-muted" },
  inactive: { label: "Inactivo", className: "bg-bg-soft text-text-muted" },
  draft: { label: "Borrador", className: "bg-bg-soft text-text-muted" },
};
