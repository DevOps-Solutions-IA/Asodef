import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "../cn";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Generic "something went wrong" presentation for query/mutation failures.
 * Callers must pass a safe, user-facing description - never a raw API
 * error, stack trace, or internal service name (see lib/api-client.ts's
 * toSafeErrorMessage, which produces exactly that).
 */
export function ErrorState({
  title = "Ocurrió un problema",
  description = "No pudimos completar esta acción. Intenta nuevamente en unos minutos.",
  action,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center", className)}>
      <AlertCircle aria-hidden="true" className="h-8 w-8 text-danger" />
      <p className="font-display text-lg font-semibold text-text-main">{title}</p>
      <p className="max-w-sm text-sm text-text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
