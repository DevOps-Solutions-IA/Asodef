import { Check, Circle, Clock3 } from "lucide-react";

export type TimelineState = "complete" | "current" | "upcoming";

export interface CompactStatusTimelineItem {
  id: string;
  label: string;
  description?: string;
  state: TimelineState;
}

export function CompactStatusTimeline({ items, label = "Estado de la solicitud" }: { items: readonly CompactStatusTimelineItem[]; label?: string }) {
  return <ol aria-label={label} className="space-y-1">{items.map((item, index) => {
    const Icon = item.state === "complete" ? Check : item.state === "current" ? Clock3 : Circle;
    return <li key={item.id} aria-current={item.state === "current" ? "step" : undefined} className="relative grid grid-cols-[2.25rem_1fr] gap-3 pb-5 last:pb-0">
      {index < items.length - 1 ? <span aria-hidden="true" className="absolute bottom-0 left-[1.08rem] top-8 w-px bg-brand-dark/15" /> : null}
      <span aria-hidden="true" className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border ${item.state === "complete" ? "border-brand-dark bg-brand-dark text-white" : item.state === "current" ? "border-brand-orange bg-brand-orange/10 text-brand-orange" : "border-brand-dark/15 bg-white text-text-muted"}`}><Icon className="h-4 w-4" /></span>
      <div className="pt-1"><p className="font-semibold text-text-main">{item.label}</p>{item.description ? <p className="mt-1 text-sm leading-6 text-text-muted">{item.description}</p> : null}</div>
    </li>;
  })}</ol>;
}
