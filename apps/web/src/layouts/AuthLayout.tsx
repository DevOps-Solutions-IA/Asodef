import { useRef } from "react";
import { Outlet } from "react-router-dom";
import { Card } from "@asodef/ui";
import { PublicHeader } from "./shared/PublicHeader";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";

/** Focused authentication card under the same authoritative public menu. */
export function AuthLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 0%, rgba(11,77,56,0.06) 0%, rgba(244,245,241,0) 70%), var(--color-bg-soft)",
      }}
    >
      <SkipToContent targetId="main-content" />
      <PublicHeader />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <main id="main-content" ref={mainRef} tabIndex={-1} className="w-full max-w-md focus:outline-none">
          <Card>
            <Outlet />
          </Card>
        </main>
      </div>
    </div>
  );
}
