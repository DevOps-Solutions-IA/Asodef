import { lazy, Suspense } from "react";

/**
 * Dev tooling only outside production. A plain top-level import of
 * @tanstack/react-query-devtools would still get bundled (and only
 * hidden via a runtime if-check) unless the import itself is deferred -
 * so this only even attempts the dynamic import when import.meta.env.PROD
 * is false, letting Vite's build-time dead-code elimination drop the
 * whole branch (and therefore the dependency) from the production bundle.
 */
const Devtools = import.meta.env.PROD
  ? null
  : lazy(() =>
      import("@tanstack/react-query-devtools").then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    );

export function ReactQueryDevtoolsLazy() {
  if (!Devtools) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <Devtools initialIsOpen={false} />
    </Suspense>
  );
}
