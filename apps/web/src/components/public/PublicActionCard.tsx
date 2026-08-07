import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

type HeadingLevel = 2 | 3;

interface PublicActionCardBaseProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  eyebrow?: string;
  actionLabel?: string;
  footer?: ReactNode;
  headingLevel?: HeadingLevel;
  density?: "compact" | "comfortable";
  hideDescriptionOnMobile?: boolean;
  selected?: boolean;
  className?: string;
}

type PublicActionCardProps = PublicActionCardBaseProps & (
  | {
      to: string;
      onClick?: never;
      ariaControls?: never;
      ariaExpanded?: never;
      ariaPressed?: never;
    }
  | {
      to?: never;
      onClick: () => void;
      ariaControls?: string;
      ariaExpanded?: boolean;
      ariaPressed?: boolean;
    }
);

function CardTitle({ level, children }: { level?: HeadingLevel; children: string }) {
  if (level === 2) return <h2 className="font-display text-lg font-semibold leading-6 tracking-[-.02em] sm:text-xl">{children}</h2>;
  if (level === 3) return <h3 className="font-display text-lg font-semibold leading-6 tracking-[-.02em] sm:text-xl">{children}</h3>;
  return <span className="block text-sm font-semibold leading-5 sm:text-base">{children}</span>;
}

/**
 * Shared public action surface. The whole card is a native link or button, so
 * it keeps one predictable focus target and equal-height grids without nested
 * interactive controls.
 */
export function PublicActionCard({
  title,
  description,
  icon: Icon,
  eyebrow,
  actionLabel,
  footer,
  headingLevel,
  density = "comfortable",
  hideDescriptionOnMobile = false,
  selected = false,
  className = "",
  ...action
}: PublicActionCardProps) {
  const densityClass = density === "compact"
    ? "min-h-24 gap-2 rounded-xl p-3 sm:gap-4 sm:rounded-2xl sm:p-4"
    : "min-h-52 gap-4 rounded-2xl p-5 sm:p-6";
  const toneClass = selected
    ? "border-brand-dark bg-brand-dark text-white shadow-e2"
    : "border-brand-dark/10 bg-white text-text-main shadow-e1 hover:-translate-y-0.5 hover:border-brand-dark/25 hover:shadow-e2";
  const cardClass = `group flex h-full w-full flex-col border text-left transition-[border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 active:scale-[.99] motion-reduce:transform-none motion-reduce:transition-none ${densityClass} ${toneClass} ${className}`;

  const content = (
    <>
      <span className="flex items-start gap-3 sm:gap-4">
        {Icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${selected ? "bg-white/12" : "bg-brand-dark-50 text-brand-dark"}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          {eyebrow && <span className={`mb-2 block text-xs font-bold uppercase tracking-[.16em] ${selected ? "text-white/70" : "text-brand-orange"}`}>{eyebrow}</span>}
          <CardTitle level={headingLevel}>{title}</CardTitle>
          <span className={`${hideDescriptionOnMobile ? "hidden sm:block" : "block"} mt-1.5 text-sm leading-5 ${selected ? "text-white/75" : "text-text-muted"}`}>{description}</span>
        </span>
      </span>
      {footer && <span className="mt-auto block">{footer}</span>}
      {actionLabel && (
        <span className={`mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold ${selected ? "text-white" : "text-brand-dark"}`}>
          {actionLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      )}
    </>
  );

  if ("to" in action && action.to) return <Link to={action.to} className={cardClass}>{content}</Link>;

  return (
    <button
      type="button"
      onClick={action.onClick}
      aria-controls={action.ariaControls}
      aria-expanded={action.ariaExpanded}
      aria-pressed={action.ariaPressed}
      className={cardClass}
    >
      {content}
    </button>
  );
}
