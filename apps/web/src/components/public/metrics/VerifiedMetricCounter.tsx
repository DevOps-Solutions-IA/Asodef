import { animate, useInView } from "motion/react";
import { usePrefersReducedMotion } from "@asodef/ui";
import { useEffect, useRef, useState } from "react";
import type { VerifiedPublicIndicator, VerifiedPublicMetric } from "./verified-public-metrics";

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
    const controls = animate(0, metric.value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplay,
      onComplete: () => {
        completedRef.current = true;
        setDisplay(metric.value);
      },
    });
    return () => controls.stop();
  }, [entered, metric.value, reduced]);

  return <div ref={elementRef} className="min-w-0 border-b border-brand-dark/10 p-5 odd:border-r sm:p-6 lg:p-7"><p className="font-display text-4xl font-semibold tabular-nums text-brand-dark sm:text-5xl"><span aria-hidden="true">{formatValue(display)}</span><span className="sr-only">{formatValue(metric.value)}</span></p><p className="mt-2 font-semibold leading-snug text-text-main">{metric.label}</p><p className="mt-1 text-xs leading-5 text-text-muted sm:text-sm">{metric.context}</p></div>;
}

function VerifiedTextIndicator({ indicator }: { indicator: Exclude<VerifiedPublicIndicator, VerifiedPublicMetric> }) {
  return <div className="min-w-0 border-b border-brand-dark/10 p-5 odd:border-r sm:p-6 lg:p-7"><p className="break-words font-display text-3xl font-semibold leading-tight text-brand-dark sm:text-4xl">{indicator.value}</p><p className="mt-2 text-sm font-semibold leading-snug text-text-main sm:text-base">{indicator.label}</p><p className="mt-1 text-xs leading-5 text-text-muted sm:text-sm">{indicator.context}</p></div>;
}

export function VerifiedIndicators({ indicators }: { indicators: readonly VerifiedPublicIndicator[] }) {
  return <section aria-label="Información institucional verificada" className="grid grid-cols-2 overflow-hidden rounded-3xl border border-brand-dark/10 bg-white shadow-e1 [&>*:nth-last-child(-n+2)]:border-b-0">{indicators.map((indicator) => indicator.kind === "numeric" ? <VerifiedMetricCounter key={indicator.id} metric={indicator} /> : <VerifiedTextIndicator key={indicator.id} indicator={indicator} />)}</section>;
}
