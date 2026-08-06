import { animate, useInView } from "motion/react";
import { usePrefersReducedMotion } from "@asodef/ui";
import { useEffect, useRef, useState } from "react";
import type { VerifiedPublicMetric } from "./verified-public-metrics";

function formatValue(value: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function VerifiedMetricCounter({ metric }: { metric: VerifiedPublicMetric }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const entered = useInView(elementRef, { once: true, amount: 0.4 });
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? metric.value : 0);
  const completedRef = useRef(reduced);

  useEffect(() => {
    if (reduced) {
      completedRef.current = true;
      setDisplay(metric.value);
      return;
    }
    if (!entered || completedRef.current) return;
    completedRef.current = true;
    const controls = animate(0, metric.value, { duration: 1.2, ease: [0.22, 1, 0.36, 1], onUpdate: setDisplay });
    return () => controls.stop();
  }, [entered, metric.value, reduced]);

  return <div ref={elementRef} className="snap-start rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e1 sm:p-5"><p className="font-display text-3xl font-semibold tabular-nums text-brand-dark sm:text-4xl"><span aria-hidden="true">{formatValue(display)}</span><span className="sr-only">{formatValue(metric.value)}</span></p><p className="mt-2 font-semibold text-text-main">{metric.label}</p><p className="mt-1 text-sm leading-5 text-text-muted sm:mt-2 sm:leading-6">{metric.context}</p></div>;
}

export function VerifiedMetrics({ metrics }: { metrics: readonly VerifiedPublicMetric[] }) {
  return <section aria-label="Cifras institucionales verificadas" className="grid snap-x auto-cols-[minmax(15rem,78vw)] grid-flow-col gap-3 overflow-x-auto pb-2 [scrollbar-width:none] sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">{metrics.map((metric) => <VerifiedMetricCounter key={metric.id} metric={metric} />)}</section>;
}
