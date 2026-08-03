import { Suspense, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./routes/router";
import { createQueryClient } from "./lib/query-client";
import { AppErrorBoundary } from "./layouts/shared/AppErrorBoundary";
import { RouteLoadingFallback } from "./layouts/shared/RouteLoadingFallback";
import { ReactQueryDevtoolsLazy } from "./lib/ReactQueryDevtoolsLazy";
import { AuthProvider } from "./lib/auth/AuthProvider";

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          </Suspense>
        </AuthProvider>
        <ReactQueryDevtoolsLazy />
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
