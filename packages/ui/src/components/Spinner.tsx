import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /** Accessible label announced to screen readers; omit only when a
   * containing element (e.g. a loading button) already has aria-busy. */
  label?: string;
}

const SIZE_STYLES: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-9 w-9 border-[3px]",
};

export function Spinner({ className, size = "md", label = "Cargando…", ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      className={cn(
        "inline-block animate-spin rounded-full border-current border-t-transparent text-current",
        SIZE_STYLES[size],
        className,
      )}
      {...props}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
