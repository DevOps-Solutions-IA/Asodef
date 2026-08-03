import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@asodef/ui";

export interface TrustBarItem {
  label: string;
  sublabel?: string;
}

export interface TrustBarProps {
  /** Up to 4 floating trust items. Renders nothing at all (not an empty
   * shell) until real, approved institutional content is supplied - see
   * US-013's completion report for what's still pending. */
  items?: TrustBarItem[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * US-013: "4 floating trust items over a dark-green rounded container
 * with staggered entrance animation." Unlike Hero (which animates on
 * initial load), this section animates in via `whileInView` - it
 * triggers once when scrolled into view and never re-fires on
 * subsequent scroll passes (`viewport={{ once: true }}`).
 */
export function TrustBar({ items }: TrustBarProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section aria-label="Indicadores de confianza" className="relative isolate">
      <div className="rounded-[28px] bg-brand-deep px-6 py-10 sm:px-10 sm:py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
          {items.slice(0, 4).map((item, index) => (
            <motion.div
              key={item.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE, delay: prefersReducedMotion ? 0 : index * 0.1 }}
              className="text-center text-white sm:text-left"
            >
              <p className="font-display text-lg font-semibold sm:text-xl">{item.label}</p>
              {item.sublabel && <p className="mt-1 text-sm text-white/70">{item.sublabel}</p>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
