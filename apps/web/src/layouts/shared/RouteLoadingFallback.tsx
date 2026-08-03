import { Spinner } from "@asodef/ui";

/** Suspense fallback for lazily-loaded route groups (payment/account/
 * company/admin/legal - see routes/router.tsx). Announces politely via
 * Spinner's built-in role="status" so screen readers hear it without
 * interrupting anything. */
export function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner size="lg" label="Cargando página…" />
    </div>
  );
}
