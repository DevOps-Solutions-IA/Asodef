import { AlertCircle, Clock3, CloudOff, LockKeyhole, ShieldAlert } from "lucide-react";
import { Button, Card, Spinner } from "@asodef/ui";
import type { SelfServiceResourceStatus } from "../../lib/self-service";

const COPY: Record<Exclude<SelfServiceResourceStatus, "success" | "partial">, { title: string; description: string }> = {
  loading: { title: "Consultando información", description: "Estamos conectando con el servicio autorizado." },
  empty: { title: "Sin registros", description: "No hay información disponible para esta sección." },
  not_configured: { title: "Integración no configurada", description: "Este servicio aún no está conectado con el proveedor autorizado." },
  unavailable: { title: "Servicio no disponible", description: "No fue posible consultar el proveedor en este momento." },
  expired: { title: "La sesión venció", description: "Vuelve a verificar tu identidad para continuar." },
  unauthorized: { title: "Acceso no autorizado", description: "Esta sesión no permite consultar el recurso solicitado." },
};

const ICONS = { empty: Clock3, not_configured: CloudOff, unavailable: AlertCircle, expired: LockKeyhole, unauthorized: ShieldAlert } as const;

export function SelfServiceStatePanel({ status, message, onRetry, actionLabel = "Intentar de nuevo" }: {
  status: Exclude<SelfServiceResourceStatus, "success" | "partial">;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
}) {
  const copy = COPY[status];
  if (status === "loading") {
    return <Card className="flex min-h-48 items-center justify-center gap-3" aria-live="polite"><Spinner /><span className="text-sm text-text-muted">{copy.description}</span></Card>;
  }
  const Icon = ICONS[status];
  return (
    <Card className="flex min-h-52 flex-col items-center justify-center text-center" role={status === "unavailable" ? "alert" : "status"}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-dark-50 text-brand-dark"><Icon aria-hidden="true" className="h-6 w-6" /></span>
      <h2 className="font-display text-xl font-semibold text-brand-dark">{copy.title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-text-muted">{message || copy.description}</p>
      {onRetry && <Button className="mt-5" variant="secondary" onClick={onRetry}>{actionLabel}</Button>}
    </Card>
  );
}
