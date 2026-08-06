import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export interface ProgressiveStepShellProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  description?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  pending?: boolean;
  announcement?: string;
}

export function ProgressiveStepShell({ currentStep, totalSteps, title, description, children, onBack, onNext, nextLabel = "Continuar", nextDisabled = false, pending = false, announcement }: ProgressiveStepShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const normalizedStep = Math.min(Math.max(currentStep, 1), totalSteps);
  const progress = Math.round((normalizedStep / Math.max(totalSteps, 1)) * 100);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [normalizedStep, title]);

  return (
    <section aria-labelledby="progressive-step-heading" className="mx-auto w-full max-w-3xl">
      <div className="flex items-center justify-between gap-4 text-xs font-semibold text-text-muted">
        <span>Paso {normalizedStep} de {totalSteps}</span>
        <span aria-hidden="true">{progress}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-dark/10" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-orange transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
      <p className="sr-only" aria-live="polite">{announcement ?? `Paso ${normalizedStep} de ${totalSteps}: ${title}`}</p>
      <div className="mt-7 rounded-[1.75rem] border border-brand-dark/10 bg-white p-5 shadow-e2 sm:p-8">
        <h1 id="progressive-step-heading" ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold tracking-[-.035em] text-text-main focus:outline-none sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl leading-7 text-text-muted">{description}</p> : null}
        <div className="mt-7">{children}</div>
        {(onBack || onNext) ? <div className="mt-8 flex items-center justify-between gap-3 border-t border-brand-dark/10 pt-5">
          {onBack ? <button type="button" onClick={onBack} className="public-button-secondary"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Atrás</button> : <span />}
          {onNext ? <button type="button" onClick={onNext} disabled={nextDisabled || pending} className="public-button-primary disabled:cursor-not-allowed disabled:opacity-55">{pending ? "Procesando…" : nextLabel}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button> : null}
        </div> : null}
      </div>
    </section>
  );
}
