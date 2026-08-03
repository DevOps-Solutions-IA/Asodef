import { useRef } from "react";
import { Link, Outlet } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { Card } from "@asodef/ui";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

/** Deliberately minimal chrome (no marketing nav/footer) - login/password
 * screens should feel focused, not like a marketing page. */
export function AuthLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-soft px-4 py-12">
      <SkipToContent targetId="main-content" />
      <Link to="/" className="mb-8 font-display text-xl font-semibold text-brand-dark">
        {ASODEF_COMPANY.legalName}
      </Link>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="w-full max-w-md focus:outline-none">
        <Card>
          <Outlet />
        </Card>
      </main>
    </div>
  );
}
