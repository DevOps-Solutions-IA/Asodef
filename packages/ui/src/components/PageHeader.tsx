import type { ReactNode } from "react";
import { cn } from "../cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}

/** Consistent heading block for account/admin/company/legal pages - not
 * the marketing Hero (that's a distinct, richer component in a later story). */
export function PageHeader({ title, description, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border-soft pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        <h1 className="font-display text-2xl font-semibold text-text-main sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}
