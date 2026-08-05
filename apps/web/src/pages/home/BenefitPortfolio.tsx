import type { ComponentType } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { SectionHeading, usePrefersReducedMotion } from "@asodef/ui";

export interface PortfolioCategory {
  title: string;
  description?: string;
  /** A Lucide icon component reference, e.g. `Heart` from "lucide-react" -
   * always rendered decorative (`aria-hidden`) since the title/description
   * text already conveys the category, never the icon alone. */
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Where "Conocer más" points. Until per-category detail routes exist,
   * this is expected to be a real, resolvable in-page anchor (e.g.
   * "#contacto") - never a broken link or "#". */
  linkHref: string;
}

export interface BenefitPortfolioProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  /** Up to 8 portfolio categories. */
  categories?: PortfolioCategory[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * US-015: "8-category editorial grid using Lucide icons, each with a
 * 'Conocer más' micro-link and hover animation." Each link gets an
 * `aria-label` that includes the category title so screen-reader users
 * tabbing through 8 identically-worded "Conocer más" links can still
 * tell them apart (visible text stays the approved "Conocer más").
 */
export function BenefitPortfolio({ eyebrow, heading, description, categories }: BenefitPortfolioProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!heading && (!categories || categories.length === 0)) {
    return null;
  }

  return (
    <section id="portafolio" aria-labelledby={heading ? "portfolio-heading" : undefined} className="scroll-mt-24 py-20 md:py-28">
      {heading && <SectionHeading eyebrow={eyebrow} title={heading} description={description} headingId="portfolio-heading" />}

      {categories && categories.length > 0 && (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.slice(0, 8).map((category, index) => {
            const Icon = category.icon;
            return (
              <motion.article
                key={category.title}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE, delay: prefersReducedMotion ? 0 : index * 0.06 }}
                className="flex flex-col rounded-2xl border border-border-soft bg-bg-elevated p-6 shadow-e1 transition-shadow hover:shadow-e2 motion-safe:hover:-translate-y-1 motion-safe:transition-transform"
              >
                <Icon aria-hidden="true" className="h-8 w-8 text-brand-green" />
                <h3 className="mt-4 font-display text-lg font-semibold text-text-main">{category.title}</h3>
                {category.description && <p className="mt-2 flex-1 text-sm text-text-muted">{category.description}</p>}
                <Link
                  to={category.linkHref}
                  aria-label={`Conocer más sobre ${category.title}`}
                  className="mt-4 inline-flex items-center text-sm font-medium text-brand-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2"
                >
                  Conocer más
                </Link>
              </motion.article>
            );
          })}
        </div>
      )}
    </section>
  );
}
