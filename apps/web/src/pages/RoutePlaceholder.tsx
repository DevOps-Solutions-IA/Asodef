import { Sparkles } from "lucide-react";

export interface RoutePlaceholderProps {
  title: string;
}

/**
 * Deliberate, honest scaffolding - not a disguised stub. US-005 establishes
 * stable route boundaries, layouts, and error/loading handling so later
 * content stories (US-011 onward) slot in real pages without restructuring
 * the router. Every route using this renders a real page at a real URL
 * with the correct layout chrome around it; only the business content is
 * still pending a dedicated story.
 *
 * Premium redesign: a real empty state (icon, bordered card, considered
 * spacing) rather than bare centered text - the honesty of the message
 * doesn't require it to look unfinished itself.
 */
export function RoutePlaceholder({ title }: RoutePlaceholderProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-soft bg-white/60 px-6 py-16 text-center">
      <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-dark-50 text-brand-dark">
        <Sparkles className="h-5 w-5" />
      </div>
      <h1 className="font-display text-2xl font-semibold text-text-main sm:text-3xl">{title}</h1>
      <p className="mx-auto max-w-md text-sm text-text-muted">Esta sección se implementará en una historia posterior.</p>
    </div>
  );
}
