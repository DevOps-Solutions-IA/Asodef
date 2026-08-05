import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "motion/react";
import { SectionHeading, usePrefersReducedMotion } from "@asodef/ui";
import { formatColombianNumber } from "./format-colombian-number";

export interface NumericStat {
  /** Raw number, e.g. 8405 - never a pre-formatted string. Formatting
   * (Colombian Spanish thousands separators) happens at render time. */
  value: number;
  label: string;
}

export interface LabeledStat {
  /** A non-numeric figure (e.g. "Más de 20 años", "Cobertura
   * nacional") - rendered as static text, never animated as a count. */
  value: string;
  label: string;
}

export interface StatisticsSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  numericStats?: NumericStat[];
  labeledStats?: LabeledStat[];
}

const EASE = [0.22, 1, 0.36, 1] as const;
const COUNT_UP_DURATION_SECONDS = 1.6;

/**
 * Counts up from 0 to `target` once the element enters the viewport,
 * and never again (`useInView`'s own `once: true` - the same
 * contract `viewport={{ once: true }}` gives the wrapping
 * `motion.div` below). Negative case (AC): with reduced motion, the
 * initial state is already `target` - no intermediate animation ever
 * runs, the final number is simply present on first render.
 */
function CountUpValue({ target, prefersReducedMotion }: { target: number; prefersReducedMotion: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [display, setDisplay] = useState(prefersReducedMotion ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion || !inView) {
      return;
    }
    const controls = animate(0, target, {
      duration: COUNT_UP_DURATION_SECONDS,
      ease: EASE,
      onUpdate: (value) => setDisplay(value),
    });
    return () => controls.stop();
  }, [inView, target, prefersReducedMotion]);

  return <span ref={ref}>{formatColombianNumber(display)}</span>;
}

/**
 * US-014 (reopened): institutional-scale figures with an animated
 * count-up for the two true numeric stats (affiliate holders,
 * beneficiaries), plus static labeled stats for figures that aren't
 * numbers to begin with (experience years, coverage, agreements) -
 * only the genuinely numeric figures get the counter treatment.
 */
export function StatisticsSection({ eyebrow, heading, description, numericStats, labeledStats }: StatisticsSectionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const hasNumeric = Boolean(numericStats && numericStats.length > 0);
  const hasLabeled = Boolean(labeledStats && labeledStats.length > 0);
  if (!heading && !hasNumeric && !hasLabeled) {
    return null;
  }

  return (
    <section id="cifras" aria-labelledby={heading ? "statistics-heading" : undefined} className="scroll-mt-24 py-20 md:py-28">
      {heading && <SectionHeading eyebrow={eyebrow} title={heading} description={description} headingId="statistics-heading" />}

      <div className="mt-10 grid grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-5">
        {hasNumeric &&
          numericStats!.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE, delay: prefersReducedMotion ? 0 : index * 0.1 }}
              className="rounded-2xl border border-border-soft bg-bg-soft p-6 text-center"
            >
              <p className="font-display text-3xl font-semibold text-brand-dark sm:text-4xl">
                <CountUpValue target={stat.value} prefersReducedMotion={prefersReducedMotion} />
              </p>
              <p className="mt-2 text-sm text-text-muted">{stat.label}</p>
            </motion.div>
          ))}

        {hasLabeled &&
          labeledStats!.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.6,
                ease: EASE,
                delay: prefersReducedMotion ? 0 : ((numericStats?.length ?? 0) + index) * 0.1,
              }}
              className="rounded-2xl border border-border-soft bg-bg-soft p-6 text-center"
            >
              <p className="font-display text-xl font-semibold text-brand-dark sm:text-2xl">{stat.value}</p>
              <p className="mt-2 text-sm text-text-muted">{stat.label}</p>
            </motion.div>
          ))}
      </div>
    </section>
  );
}
