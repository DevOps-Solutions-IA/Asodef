import { ErrorState } from "@asodef/ui";

export interface ServiceUnavailablePageProps {
  onRetry?: () => void;
}

/** Generic "something went wrong" page for route/query errors. Never
 * receives or renders a raw error message, stack trace, or service name -
 * see RouteErrorBoundary, which is the only thing that renders this. */
export function ServiceUnavailablePage({ onRetry }: ServiceUnavailablePageProps) {
  return (
    <ErrorState
      title="Servicio no disponible"
      description="Estamos teniendo problemas técnicos. Intenta nuevamente en unos minutos."
      action={
        onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-dark px-5 text-sm font-medium text-white transition-colors hover:bg-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2"
          >
            Reintentar
          </button>
        )
      }
    />
  );
}
