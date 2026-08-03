import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useLocation } from "react-router-dom";

/**
 * Moves focus to the layout's main landmark after each route change (not
 * on the very first render, so we don't steal focus from the URL bar/skip
 * link on initial load) - screen reader users get oriented at the new
 * page instead of focus silently staying wherever the previous page left
 * it. The target must be focusable (tabIndex={-1} on <main>) since it
 * isn't naturally an interactive element.
 */
export function useFocusMainOnRouteChange(mainRef: RefObject<HTMLElement>): void {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on pathname, mainRef is stable
  }, [location.pathname]);
}
