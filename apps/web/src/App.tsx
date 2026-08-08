import { Suspense, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./routes/router";
import { createQueryClient } from "./lib/query-client";
import { AppErrorBoundary } from "./layouts/shared/AppErrorBoundary";
import { RouteLoadingFallback } from "./layouts/shared/RouteLoadingFallback";
import { ReactQueryDevtoolsLazy } from "./lib/ReactQueryDevtoolsLazy";
import { AuthProvider } from "./lib/auth/AuthProvider";
import { CookieConsentProvider } from "./lib/cookie-consent/CookieConsentContext";
import { CookieConsentBanner } from "./components/cookie-consent/CookieConsentBanner";
import { AppPreloader } from "./components/public/AppPreloader";

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <>
      <AppPreloader pathname={window.location.pathname} />
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CookieConsentProvider>
              <Suspense fallback={<RouteLoadingFallback />}>
                <RouterProvider router={router} future={{ v7_startTransition: true }} />
              </Suspense>
              <CookieConsentBanner />
            </CookieConsentProvider>
          </AuthProvider>
          <ReactQueryDevtoolsLazy />
        </QueryClientProvider>
      </AppErrorBoundary>
    </>
  );
}
