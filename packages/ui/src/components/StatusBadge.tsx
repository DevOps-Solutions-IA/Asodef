import type { HTMLAttributes } from "react";
import { cn } from "../cn";
import { STATUS_TONE_CONFIG, type StatusTone } from "../status/status-tone";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /** Overrides the tone's default Spanish label - use when a domain status
   * map (payment status, contract status, ...) has its own exact wording. */
  label?: string;
}

export function StatusBadge({ tone, label, className, ...props }: StatusBadgeProps) {
  const config = STATUS_TONE_CONFIG[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        config.className,
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? config.label}
    </span>
  );
}
