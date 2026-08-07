import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

interface ScrollPosition {
  left: number;
  top: number;
}

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

function scrollWindow(position: ScrollPosition): void {
  // jsdom exposes a placeholder that only emits a "not implemented" error.
  // Focused tests replace it with a mock; browsers execute the native method.
  if (navigator.userAgent.includes("jsdom") && !("mock" in window.scrollTo)) return;
  window.scrollTo({ behavior: "auto", ...position });
}

/**
 * Deterministic SPA scroll restoration:
 * - hash targets always win;
 * - PUSH and REPLACE start at the top;
 * - POP restores the position recorded for that history entry.
 *
 * Direct loads also start at the top unless a valid hash target is present.
 * All movement is instant and therefore independent of motion settings.
 */
export function useScrollToHash(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, ScrollPosition>());
  const firstRender = useRef(true);

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const entryKey = location.key;
    const savedPositions = positions.current;

    if (firstRender.current) {
      firstRender.current = false;
      if (!scrollToHash(location.hash)) scrollWindow({ left: 0, top: 0 });
    } else if (!scrollToHash(location.hash)) {
      const restored = navigationType === "POP" ? positions.current.get(entryKey) : undefined;
      scrollWindow({
        left: restored?.left ?? 0,
        top: restored?.top ?? 0,
      });
    }

    return () => {
      savedPositions.set(entryKey, { left: window.scrollX, top: window.scrollY });
    };
  }, [location.hash, location.key, location.pathname, location.search, navigationType]);
}
