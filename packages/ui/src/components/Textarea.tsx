import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, rows = 4, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "block w-full resize-y rounded-xl border border-border-soft bg-white px-3.5 py-2.5 text-sm text-text-main shadow-[inset_0_1px_2px_rgba(6,40,30,0.04)]",
        "transition-colors duration-150 ease-out placeholder:text-text-muted hover:border-brand-dark/25",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:border-brand-dark",
        "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger",
        "disabled:cursor-not-allowed disabled:bg-bg-soft disabled:text-text-muted disabled:hover:border-border-soft",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
