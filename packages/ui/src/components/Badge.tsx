import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type BadgeVariant = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: "bg-bg-soft text-text-main",
  brand: "bg-brand-dark/10 text-brand-dark",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-current/10 px-2.5 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    />
  );
}
