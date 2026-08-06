import type { ReactNode } from "react";

export interface MobileActionOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export interface MobileActionSwitcherProps<Value extends string> {
  label: string;
  options: readonly MobileActionOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}

export function MobileActionSwitcher<Value extends string>({ label, options, value, onChange }: MobileActionSwitcherProps<Value>) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-3 grid gap-2 min-[390px]:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-14 rounded-2xl border px-4 py-3 text-left transition motion-reduce:transition-none ${selected ? "border-brand-dark bg-brand-dark text-white shadow-e2" : "border-brand-dark/15 bg-white text-text-main hover:border-brand-dark/35 hover:bg-bg-soft"}`}
            >
              <span className="flex items-center gap-2 font-semibold">{option.icon}{option.label}</span>
              {option.description ? <span className={`mt-1 block text-xs leading-5 ${selected ? "text-white/70" : "text-text-muted"}`}>{option.description}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
