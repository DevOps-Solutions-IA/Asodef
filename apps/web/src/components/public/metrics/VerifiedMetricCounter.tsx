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

  return <div ref={elementRef} className="col-span-2 rounded-2xl border border-brand-dark/10 bg-brand-deep p-5 text-white shadow-e2 sm:col-span-1"><p className="font-display text-4xl font-semibold tabular-nums text-white"><span aria-hidden="true">{formatValue(display)}</span><span className="sr-only">{formatValue(metric.value)}</span></p><p className="mt-2 font-semibold text-white">{metric.label}</p><p className="mt-1 text-sm leading-5 text-white/65">{metric.context}</p></div>;
}

function VerifiedTextIndicator({ indicator }: { indicator: Exclude<VerifiedPublicIndicator, VerifiedPublicMetric> }) {
  return <div className="rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e1 sm:p-5"><p className="font-display text-2xl font-semibold text-brand-dark sm:text-3xl">{indicator.value}</p><p className="mt-2 text-sm font-semibold text-text-main sm:text-base">{indicator.label}</p><p className="mt-1 text-xs leading-5 text-text-muted sm:text-sm">{indicator.context}</p></div>;
}

export function VerifiedIndicators({ indicators }: { indicators: readonly VerifiedPublicIndicator[] }) {
  return <section aria-label="Información institucional verificada" className="grid grid-cols-2 gap-3 sm:grid-cols-3">{indicators.map((indicator) => indicator.kind === "numeric" ? <VerifiedMetricCounter key={indicator.id} metric={indicator} /> : <VerifiedTextIndicator key={indicator.id} indicator={indicator} />)}</section>;
}
