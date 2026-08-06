import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

export interface QuickAction {
  label: string;
  to: string;
  icon: LucideIcon;
}

export function HorizontalQuickActions({ actions, label = "Accesos rápidos" }: { actions: readonly QuickAction[]; label?: string }) {
  return <nav aria-label={label} className="-mx-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"><ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">{actions.map(({ label: actionLabel, to, icon: Icon }) => <li key={`${to}-${actionLabel}`}><Link to={to} className="flex min-h-12 min-w-max items-center gap-2 rounded-full border border-brand-dark/15 bg-white px-4 text-sm font-semibold text-brand-dark shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:transform-none motion-reduce:transition-none"><Icon aria-hidden="true" className="h-4 w-4 text-brand-orange" />{actionLabel}</Link></li>)}</ul></nav>;
}
