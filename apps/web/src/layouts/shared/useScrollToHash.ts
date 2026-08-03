import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * React Router doesn't scroll to `#hash` targets on its own - neither on
 * a fresh page load (the browser's native anchor-scroll fires before the
 * SPA has rendered anything) nor on an in-app navigation to a new path
 * with a hash. Without this, in-page anchors like Hero's CTAs or the
 * homepage nav resolve their `href` correctly but never actually move
 * the viewport. Runs an instant (non-animated) scroll - no motion to
 * respect reduced-motion preferences here, since there's no entrance
 * animation involved, just a position jump.
 */
export function useScrollToHash(): void {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [location.pathname, location.hash]);
}
