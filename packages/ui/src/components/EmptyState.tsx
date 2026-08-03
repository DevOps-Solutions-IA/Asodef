import type { ReactNode } from "react";
import { cn } from "../cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="text-text-muted">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-semibold text-text-main">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
