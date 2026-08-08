import { useRef } from "react";
import { Link, Outlet } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { PublicHeader } from "./shared/PublicHeader";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { useScrollToHash } from "./shared/useScrollToHash";

/** Centro de Pagos with the shared public navigation and a focused,
 * transactional content/footer treatment. */
export function PaymentLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef, { preventScroll: true });
  useScrollToHash();

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-surface-canvas">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_75%_10%,rgba(251,152,58,0.13),transparent_32%),linear-gradient(135deg,rgba(22,24,51,0.07),transparent_58%)]" />
      <SkipToContent targetId="main-content" />
      <PublicHeader />

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-9 focus:outline-none sm:px-8 sm:py-12 lg:px-12 lg:py-16"
      >
        <Outlet />
      </main>

      <footer className="relative border-t border-border-soft bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <span className="inline-flex items-center gap-2 text-text-muted"><LockKeyhole aria-hidden="true" className="h-4 w-4 text-brand-orange" /> Consulta y gestión transaccional ASODEF</span>
          <Link to="/legal" className="font-medium text-brand-dark hover:underline">Centro legal</Link>
        </div>
      </footer>
    </div>
  );
}
