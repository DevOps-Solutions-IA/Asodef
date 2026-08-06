import { CircleHelp, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function CollapsibleContextHelp({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className="group rounded-2xl border border-brand-dark/10 bg-bg-soft/70"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold text-brand-dark marker:hidden"><CircleHelp aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-orange" /><span className="flex-1">{title}</span><ChevronDown aria-hidden="true" className="h-4 w-4 transition group-open:rotate-180 motion-reduce:transition-none" /></summary><div className="border-t border-brand-dark/10 px-4 py-4 text-sm leading-6 text-text-muted">{children}</div></details>;
}
