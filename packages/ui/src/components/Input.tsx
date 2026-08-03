import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, disabled, ...props }, ref) => {
  return (
    <input
      ref={ref}
      disabled={disabled}
      className={cn(
        "block w-full rounded-xl border border-border-soft bg-white px-3.5 py-2.5 text-sm text-text-main",
        "placeholder:text-text-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:border-brand-dark",
        "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger",
        "disabled:cursor-not-allowed disabled:bg-bg-soft disabled:text-text-muted",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
