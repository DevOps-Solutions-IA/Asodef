import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface CompactPublicHeroActionBase {
  label: string;
  primary?: boolean;
}

export type CompactPublicHeroAction = CompactPublicHeroActionBase & (
  | { to: string }
  | { href: string }
);

export interface CompactPublicHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  actions: readonly CompactPublicHeroAction[];
  visual?: ReactNode;
}

/**
 * A task-first hero for non-legal public routes. It deliberately keeps the
 * action before optional supporting visuals in the mobile reading order.
 */
export function CompactPublicHero({ eyebrow, title, description, actions, visual }: CompactPublicHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-brand-dark/10 bg-bg-soft/60 py-10 sm:py-16 lg:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:px-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-dark">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.35rem,10vw,4.75rem)] font-semibold leading-[.96] tracking-[-.05em] text-text-main">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted sm:text-lg sm:leading-8">{description}</p>
          <div className="mt-7 grid gap-2 min-[390px]:grid-cols-2 sm:flex sm:flex-wrap">
            {actions.slice(0, 2).map((action) => (
              "href" in action ? (
                <a key={`${action.href}-${action.label}`} href={action.href} className={action.primary ? "public-button-primary" : "public-button-secondary"}>
                  {action.label}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
              ) : (
                <Link key={`${action.to}-${action.label}`} to={action.to} className={action.primary ? "public-button-primary" : "public-button-secondary"}>
                  {action.label}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )
            ))}
          </div>
        </div>
        {visual ? <div className="min-w-0">{visual}</div> : null}
      </div>
    </section>
  );
}
