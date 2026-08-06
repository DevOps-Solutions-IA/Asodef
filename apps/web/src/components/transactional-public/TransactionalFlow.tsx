import { useEffect, useRef, type ReactNode } from "react";
import { Check, CheckCircle2, Printer } from "lucide-react";
import {
  CompactStatusTimeline as SharedCompactStatusTimeline,
  CopyReferenceAction,
  MobileStickyActionBar,
  type CompactStatusTimelineItem,
} from "../public/mobile";

export { CopyReferenceAction } from "../public/mobile";

export type TransactionalMode = "create" | "track";

export function TransactionalTaskSwitcher({
  mode,
  createLabel,
  trackLabel,
  onChange,
}: {
  mode: TransactionalMode | null;
  createLabel: string;
  trackLabel: string;
  onChange: (mode: TransactionalMode) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Selecciona la tarea que quieres realizar">
      <button
        type="button"
        onClick={() => onChange("create")}
        aria-pressed={mode === "create"}
        className={`min-h-14 rounded-2xl border px-5 py-4 text-left font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
          mode === "create" ? "border-brand-dark bg-brand-dark text-white" : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-dark/35"
        }`}
      >
        {createLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("track")}
        aria-pressed={mode === "track"}
        className={`min-h-14 rounded-2xl border px-5 py-4 text-left font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${
          mode === "track" ? "border-brand-dark bg-brand-dark text-white" : "border-brand-dark/15 bg-white text-brand-dark hover:border-brand-dark/35"
        }`}
      >
        {trackLabel}
      </button>
    </div>
  );
}

export function ProgressiveStepShell({
  step,
  total,
  title,
  description,
  children,
}: {
  step: number;
  total: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, title]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="font-semibold text-brand-dark">Paso {step + 1} de {total}</p>
        <span className="text-text-muted">{Math.round(((step + 1) / total) * 100)}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-dark/10" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand-orange transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>
      <div aria-live="polite" className="sr-only">Paso {step + 1} de {total}: {title}</div>
      <h2 ref={headingRef} tabIndex={-1} className="mt-7 font-display text-2xl font-semibold text-text-main focus:outline-none sm:text-3xl">
        {title}
      </h2>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted sm:text-base">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function ChoiceGrid({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: readonly { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectAndFocus(index: number) {
    const normalized = (index + options.length) % options.length;
    const option = options[normalized];
    if (!option) return;
    onChange(option.value);
    optionRefs.current[normalized]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            ref={(node) => { optionRefs.current[index] = node; }}
            tabIndex={selected || (!value && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                selectAndFocus(index + 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                selectAndFocus(index - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                selectAndFocus(0);
              } else if (event.key === "End") {
                event.preventDefault();
                selectAndFocus(options.length - 1);
              }
            }}
            className={`min-h-20 rounded-2xl border p-4 text-left transition-[border-color,background-color,transform] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 active:scale-[.99] ${
              selected ? "border-brand-dark bg-brand-dark text-white" : "border-brand-dark/15 bg-white hover:border-brand-dark/35 hover:bg-bg-soft"
            }`}
          >
            <span className="flex items-center justify-between gap-3 font-semibold">
              {option.label}
              {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </span>
            {option.description && <span className={`mt-1 block text-sm leading-5 ${selected ? "text-white/70" : "text-text-muted"}`}>{option.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function FlowActions({
  canGoBack,
  nextLabel = "Continuar",
  onBack,
  onNext,
  nextDisabled,
}: {
  canGoBack: boolean;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <MobileStickyActionBar label="Navegación del formulario">
      {canGoBack ? <button type="button" onClick={onBack} className="public-button-secondary min-h-12 justify-center">Atrás</button> : null}
      <button type="button" onClick={onNext} disabled={nextDisabled} className="public-button-primary min-h-12 justify-center only:col-span-full disabled:opacity-60">
        {nextLabel}
      </button>
    </MobileStickyActionBar>
  );
}

export function ConfirmationPanel({
  title,
  reference,
  referenceLabel,
  children,
  onTrack,
  onRestart,
  restartLabel = "Iniciar otro trámite",
}: {
  title: string;
  reference: string;
  referenceLabel: string;
  children: ReactNode;
  onTrack: () => void;
  onRestart: () => void;
  restartLabel?: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-success/25 bg-success/5 p-5 sm:p-8" role="status">
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
      {title && <h2 className="mt-5 font-display text-2xl font-semibold text-text-main">{title}</h2>}
      <p className="mt-3 text-sm leading-6 text-text-muted">{children}</p>
      <p className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-text-muted">{referenceLabel}</p>
      <p className="mt-2 break-all rounded-xl bg-white px-4 py-3 font-mono font-bold text-brand-dark shadow-e1">{reference}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <CopyReferenceAction value={reference} />
        <button type="button" onClick={onTrack} className="public-button-primary min-h-12 justify-center">Consultar estado</button>
        <button type="button" onClick={() => window.print()} className="public-button-secondary min-h-12 justify-center print-hide">
          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir confirmación
        </button>
        <button type="button" onClick={onRestart} className="min-h-12 px-4 text-sm font-semibold text-brand-dark underline-offset-4 hover:underline">{restartLabel}</button>
      </div>
    </div>
  );
}

export function CompactStatusTimeline({ status, label }: { status: string; label: string }) {
  const finished = status === "RESOLVED" || status === "CLOSED";
  const inProgress = status !== "RECEIVED" && !finished;
  const items: readonly CompactStatusTimelineItem[] = [
    { id: "received", label: "Radicado", state: "complete" },
    { id: "management", label: "En gestión", state: finished ? "complete" : inProgress ? "current" : "upcoming" },
    { id: "finished", label: "Finalizado", state: finished ? "current" : "upcoming" },
  ];
  return <div className="mt-5"><SharedCompactStatusTimeline items={items} label={`Progreso del caso. Estado actual: ${label}`} /></div>;
}
