import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, id, label, ...props }, ref) => {
  const generatedId = useId();
  const resolvedId = id ?? generatedId;

  const input = (
    <input
      ref={ref}
      id={resolvedId}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 rounded border-border-soft text-brand-dark",
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
Checkbox.displayName = "Checkbox";
