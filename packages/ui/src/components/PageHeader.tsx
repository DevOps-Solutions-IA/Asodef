import type { ReactNode } from "react";
import { cn } from "../cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}

/** Consistent heading block for account/admin/company/legal pages - not
 * the marketing Hero (that's a distinct, richer component in a later story). */
export function PageHeader({ title, description, eyebrow = "ASODEF · Gestión empresarial", icon, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn("relative flex flex-col gap-5 overflow-hidden rounded-xl3 border border-brand-dark/10 bg-white/70 p-5 shadow-e1 backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between sm:p-6", className)}>
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-orange via-brand-orange to-brand-green" />
      <div className="relative flex min-w-0 items-start gap-4">
        {icon && <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-dark text-white shadow-e2 sm:flex">{icon}</span>}
        <div className="min-w-0">
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        {eyebrow && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-green">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] text-text-main sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="relative flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
