import { motion } from "motion/react";
import { SectionHeading, usePrefersReducedMotion } from "@asodef/ui";
import aboutImage from "../../assets/about-team.webp";

export interface AboutCard {
  title: string;
  body?: string;
}

export interface AboutSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  /** Up to 3 cards (Nuestra historia / Nuestra misión / Nuestra visión).
   * Each card's title may be a confirmed, generic section label even
   * before its body copy is approved - `body` renders only when
   * supplied, never as placeholder text. */
  cards?: AboutCard[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * US-013: "About section renders the two-column layout with Nuestra
 * historia / Nuestra misión / Nuestra visión cards." Anchored at
 * #quienes-somos so the Navbar/footer/Hero's own links (built in
 * separate stories) can deep-link here. Cards animate in via
 * `whileInView`, staggered, once only - never re-triggering on a later
 * scroll pass.
 */
export function AboutSection({ eyebrow, heading, description, cards }: AboutSectionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!heading && (!cards || cards.length === 0)) {
    return null;
  }

  return (
    <section id="quienes-somos" aria-labelledby={heading ? "about-heading" : undefined} className="marketing-section marketing-section--soft">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col justify-center">
          {heading && <SectionHeading eyebrow={eyebrow} title={heading} description={description} headingId="about-heading" />}
          <div className="relative mt-8 overflow-hidden rounded-[30px] border border-brand-dark/10 shadow-e3">
            <img src={aboutImage} alt="" role="presentation" className="h-full w-full object-cover" />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-brand-deep/30 to-transparent" />
          </div>
        </div>

        {cards && cards.length > 0 && (
          <div className="flex flex-col gap-6">
            {cards.slice(0, 3).map((card, index) => (
              <motion.article
                key={card.title}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE, delay: prefersReducedMotion ? 0 : index * 0.12 }}
                className="premium-card-glow rounded-xl3 border border-brand-dark/10 bg-white/90 p-7 shadow-e1 transition duration-200 hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:transform-none"
              >
                <span className="mb-4 block h-1 w-10 rounded-full bg-brand-orange" aria-hidden="true" />
                <h3 className="font-display text-lg font-semibold text-text-main">{card.title}</h3>
                {card.body && <p className="mt-2 text-sm text-text-muted">{card.body}</p>}
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
