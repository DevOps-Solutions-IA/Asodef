import { forwardRef, useId } from "react";
import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(({ className, id, label, ...props }, ref) => {
  const generatedId = useId();
  const resolvedId = id ?? generatedId;

  const input = (
    <input
      ref={ref}
      id={resolvedId}
      type="radio"
      className={cn(
        "h-4 w-4 shrink-0 border-border-soft text-brand-dark",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );

  if (!label) {
    return input;
  }

  return (
    <label htmlFor={resolvedId} className="inline-flex cursor-pointer items-start gap-2 text-sm text-text-main">
      {input}
      <span>{label}</span>
    </label>
  );
});
Radio.displayName = "Radio";

export interface RadioGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
}

/** Groups Radio items under a single accessible name via role="radiogroup". */
export function RadioGroup({ label, className, children, ...props }: RadioGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-col gap-2", className)} {...props}>
      {children}
    </div>
  );
}
