import type { ReactNode } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@asodef/ui";

/** Content is present and readable at every frame; the transition adds only a subtle positional cue. */
export function RouteTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return <motion.div key={routeKey} initial={reduced ? false : { opacity: 0.98, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}
