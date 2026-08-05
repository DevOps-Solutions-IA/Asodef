import { motion } from "motion/react";
import { SectionHeading, usePrefersReducedMotion } from "@asodef/ui";

export interface BenefitCard {
  title: string;
  body?: string;
}

export interface CompanyBenefitsProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  /** Up to 6 numbered benefit cards. */
  cards?: BenefitCard[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * US-015: "asymmetric layout with the 6 numbered benefit cards ... hover
 * elevation and accessible focus states." The first card spans two grid
 * columns on lg+ (a bento-style featured slot) while the rest sit in a
 * regular 3-column grid - that's the asymmetry, a layout choice, not
 * content. Entrance follows the same `whileInView`-once, staggered,
 * reduced-motion-safe pattern as TrustBar/AboutSection (US-013).
 */
export function CompanyBenefits({ eyebrow, heading, description, cards }: CompanyBenefitsProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!heading && (!cards || cards.length === 0)) {
    return null;
  }

  return (
    <section id="beneficios" aria-labelledby={heading ? "benefits-heading" : undefined} className="scroll-mt-24 py-20 md:py-28">
      {heading && <SectionHeading eyebrow={eyebrow} title={heading} description={description} headingId="benefits-heading" />}

      {cards && cards.length > 0 && (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.slice(0, 6).map((card, index) => (
            <motion.article
              key={card.title}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE, delay: prefersReducedMotion ? 0 : index * 0.08 }}
              className={
                "rounded-2xl border border-border-soft bg-white p-6 shadow-e1 transition-shadow hover:shadow-e2 motion-safe:hover:-translate-y-1 motion-safe:transition-transform" +
                (index === 0 ? " sm:col-span-2 lg:col-span-2" : "")
              }
            >
              <span className="font-display text-sm font-semibold text-brand-orange">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-display text-lg font-semibold text-text-main">{card.title}</h3>
              {card.body && <p className="mt-2 text-sm text-text-muted">{card.body}</p>}
            </motion.article>
          ))}
        </div>
      )}
    </section>
  );
}
