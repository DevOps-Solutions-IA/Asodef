import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@asodef/ui";
import { BrandLogo } from "../../layouts/shared/BrandLogo";
import { shouldShowInitialPreloader } from "./preloader-utils";

export function AppPreloader({ pathname }: { pathname: string }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">(
    shouldShowInitialPreloader(pathname) ? "visible" : "hidden",
  );

  useEffect(() => {
    if (!shouldShowInitialPreloader(pathname)) {
      setPhase("hidden");
      return;
    }

    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const maximumWait = new Promise<void>((resolve) => {
      hideTimer = setTimeout(resolve, 1_200);
    });
    const fontsReady = document.fonts?.ready ?? Promise.resolve();

    void Promise.race([fontsReady, maximumWait]).then(() => {
      if (cancelled) return;
      setPhase("leaving");
      hideTimer = setTimeout(() => {
        if (!cancelled) setPhase("hidden");
      }, reduced ? 0 : 220);
    });

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [pathname, reduced]);

  if (phase === "hidden") return null;

  return (
    <div
      data-state={phase}
      role="status"
      aria-live="polite"
      aria-label="ASODEF está preparando la experiencia"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f8f9f6] px-6 opacity-100 transition-opacity duration-200 data-[state=leaving]:pointer-events-none data-[state=leaving]:opacity-0 motion-reduce:transition-none"
    >
      <div className="flex w-full max-w-52 flex-col items-center">
        <BrandLogo className="h-12 w-auto" />
        <div aria-hidden className="mt-6 h-1 w-full overflow-hidden rounded-full bg-brand-dark/10">
          <span className="block h-full w-2/3 origin-left animate-pulse rounded-full bg-gradient-to-r from-brand-dark via-brand-green to-brand-orange motion-reduce:animate-none" />
        </div>
        <span className="sr-only">Cargando ASODEF</span>
      </div>
    </div>
  );
}
