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
 */
export function RoutePlaceholder({ title }: RoutePlaceholderProps) {
  return (
    <div className="py-16 text-center">
      <h1 className="font-display text-3xl font-semibold text-text-main">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-muted">
        Esta sección se implementará en una historia posterior.
      </p>
    </div>
  );
}
