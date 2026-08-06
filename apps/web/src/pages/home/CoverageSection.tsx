import { motion } from "motion/react";
import { SectionHeading, usePrefersReducedMotion } from "@asodef/ui";
import colombiaMap from "../../assets/colombia-map.svg";

export interface CoverageCard {
  title: string;
  body?: string;
}

export interface CoverageSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  /** Up to 3 info cards. The first card's body is expected to state Cali
   * as headquarters in real visible text - that's what satisfies "map
   * information available in visible text", not alt text on the
   * decorative map image itself (see the map's own aria-hidden below). */
  cards?: CoverageCard[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * US-016: stylized (non-cartographic) Colombia map with Cali marked,
 * plus 3 info cards. The map is purely decorative (`aria-hidden`) -
 * the "Sede principal" card's own body text is the real, accessible
 * statement that Cali is the headquarters, not the SVG.
 */
export function CoverageSection({ eyebrow, heading, description, cards }: CoverageSectionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!heading && (!cards || cards.length === 0)) {
    return null;
  }

  return (
    <section id="cobertura" aria-labelledby={heading ? "coverage-heading" : undefined} className="marketing-section marketing-section--soft">
      {heading && <SectionHeading eyebrow={eyebrow} title={heading} description={description} headingId="coverage-heading" />}

      <div className="mt-10 grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <img
          src={colombiaMap}
          alt=""
          aria-hidden="true"
          className="mx-auto h-auto w-full max-w-sm drop-shadow-[0_24px_35px_rgba(6,77,56,0.18)]"
          width={300}
          height={480}
        />

        {cards && cards.length > 0 && (
          <div className="flex flex-col gap-6">
            {cards.slice(0, 3).map((card, index) => (
              <motion.article
                key={card.title}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE, delay: prefersReducedMotion ? 0 : index * 0.1 }}
                className="premium-card-glow rounded-xl3 border border-brand-dark/10 bg-white/90 p-7 shadow-e1 transition duration-200 hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:transform-none"
              >
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
