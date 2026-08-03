import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { cn, usePrefersReducedMotion } from "@asodef/ui";
import heroImage from "../../assets/hero-family.webp";

export interface HeroStat {
  value: string;
  label: string;
}

export interface HeroCta {
  label: string;
  href: string;
  variant?: "primary" | "outline";
}

export interface HeroProps {
  /** Small badge above the heading. Omitted entirely (not a placeholder)
   * until real copy is confirmed. */
  eyebrow?: string;
  /** Pass JSX so the caller can mark the highlighted phrase itself, e.g.
   * `Trabajamos pensando en su <span className="text-brand-orange">bienestar</span>` -
   * this component makes no wording decisions of its own. */
  heading?: ReactNode;
  supportingCopy?: string;
  /** Floating glass labels over the image. Omitted until real figures
   * are confirmed - never populated with example/illustrative numbers. */
  stats?: HeroStat[];
  ctas?: HeroCta[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Explicit position per stat index, spread around the organic image
 * shape (top-left / middle-right / bottom-left) rather than clustering.
 * The left-anchored slots (0, 2) can safely spill outward past the
 * image edge on sm+ - the image column sits on the right half of the
 * page, so there's ample margin to its left. The right-anchored slot
 * (1) deliberately stays a *positive* inset (never negative): the
 * image's right edge sits close to the page's own right edge, so a
 * negative offset there pushes the card past the viewport and gets
 * silently clipped by the section's overflow-hidden (confirmed via
 * browser verification, not just computed at random) - `right-6`
 * keeps it safely overlapping the image instead of spilling past it. */
const STAT_POSITION_CLASSES = [
  "left-2 top-8 sm:-left-6",
  "right-2 top-1/2 -translate-y-1/2 sm:right-6",
  "left-2 bottom-10 sm:-left-6",
] as const;

const CTA_BASE_CLASS =
  "inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2";
const CTA_VARIANT_CLASS: Record<NonNullable<HeroCta["variant"]>, string> = {
  primary: "bg-brand-dark text-white hover:bg-brand-orange",
  outline: "border border-brand-dark/20 bg-white/70 text-brand-dark backdrop-blur hover:bg-white",
};

/**
 * US-012: split-layout hero with a one-time entrance animation. Every
 * text field is optional and renders only when supplied by the caller -
 * this component never invents or hardcodes marketing copy (see
 * HomePage.tsx for what's actually wired in and why).
 */
export function Hero({ eyebrow, heading, supportingCopy, stats, ctas }: HeroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // initial={false} makes motion start already in its final ("animate")
  // state - i.e. no entrance animation plays at all, matching "renders
  // fully visible immediately with no animated entrance" for reduced
  // motion. Using initial/animate (never whileInView) is also what makes
  // this fire exactly once on mount and never re-trigger on scroll.
  const textInitial = prefersReducedMotion ? false : { opacity: 0, y: 24 };
  const imageInitial = prefersReducedMotion ? false : { opacity: 0, scale: 0.96 };
  const duration = prefersReducedMotion ? 0 : 0.7;

  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden py-16 sm:py-20">
      <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          {eyebrow && (
            <motion.span
              initial={textInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration, ease: EASE }}
              className="inline-flex rounded-full border border-brand-dark/15 bg-white/70 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-brand-dark backdrop-blur"
            >
              {eyebrow}
            </motion.span>
          )}

          {heading && (
            <motion.h1
              initial={textInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration, ease: EASE, delay: prefersReducedMotion ? 0 : 0.1 }}
              className={cn("font-display font-semibold text-text-main", "text-[clamp(2.25rem,5vw+1rem,4rem)] leading-[1.05]", eyebrow && "mt-5")}
            >
              {heading}
            </motion.h1>
          )}

          {supportingCopy && (
            <motion.p
              initial={textInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration, ease: EASE, delay: prefersReducedMotion ? 0 : 0.2 }}
              className="mt-6 max-w-lg text-lg text-text-muted"
            >
              {supportingCopy}
            </motion.p>
          )}

          {ctas && ctas.length > 0 && (
            <motion.div
              initial={textInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration, ease: EASE, delay: prefersReducedMotion ? 0 : 0.3 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              {ctas.map((cta) => (
                <Link key={cta.href} to={cta.href} className={cn(CTA_BASE_CLASS, CTA_VARIANT_CLASS[cta.variant ?? "outline"])}>
                  {cta.label}
                </Link>
              ))}
            </motion.div>
          )}
        </div>

        <div className="relative">
          <motion.div
            initial={imageInitial}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.8, ease: EASE }}
            className="relative aspect-[6/7] overflow-hidden rounded-[40%_60%_55%_45%/45%_40%_60%_55%] shadow-[0_30px_80px_rgba(6,77,56,0.25)]"
          >
            {/* Stable placeholder path (US-012) - a real photograph drops
             * in at this exact path later with no code change required. */}
            <img src={heroImage} alt="" role="presentation" className="h-full w-full object-cover" />
          </motion.div>

          {stats && stats.length > 0 && (
            <div className="pointer-events-none absolute inset-0">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={cn(
                    "absolute rounded-2xl border border-white/40 bg-white/80 px-5 py-3 text-center shadow-lg backdrop-blur-xl",
                    STAT_POSITION_CLASSES[index % STAT_POSITION_CLASSES.length],
                  )}
                >
                  <p className="font-display text-2xl font-semibold text-brand-dark">{stat.value}</p>
                  <p className="text-xs text-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
