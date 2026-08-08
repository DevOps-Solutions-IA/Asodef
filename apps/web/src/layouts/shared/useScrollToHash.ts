import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function scrollToHash(hash: string): boolean {
  if (!hash) return false;
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // A malformed escape sequence cannot identify a rendered target. Keeping
    // the raw fragment is safer than failing the route effect.
  }
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior: "auto", block: "start" });
  return true;
}

function scrollWindow(position: { left: number; top: number }): void {
  // jsdom exposes a placeholder that only emits a "not implemented" error.
  // Focused tests replace it with a mock; browsers execute the native method.
  if (navigator.userAgent.includes("jsdom") && !("mock" in window.scrollTo)) return;
  window.scrollTo({ behavior: "auto", ...position });
}

/**
 * Deterministic SPA scroll restoration:
 * - hash targets always win;
 * - every path/search navigation starts at the top;
 * - browser back/forward follows the same predictable page-entry rule.
 *
 * Direct loads also start at the top unless a valid hash target is present.
 * All movement is instant and therefore independent of motion settings.
 */
export function useScrollToHash(): void {
  const location = useLocation();

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (!scrollToHash(location.hash)) scrollWindow({ left: 0, top: 0 });
  }, [location.hash, location.key, location.pathname, location.search]);
}
