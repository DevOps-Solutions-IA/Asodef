import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { cn, usePrefersReducedMotion } from "@asodef/ui";

export interface AllianceCtaPrimaryAction {
  label: string;
  href: string;
}

export interface AllianceCtaWhatsappAction {
  label: string;
  /** Digits only, no "+" - e.g. "573232733927". */
  phoneNumber: string;
  message: string;
}

export interface AllianceCtaProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  primaryAction?: AllianceCtaPrimaryAction;
  whatsapp?: AllianceCtaWhatsappAction;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * US-016: dark-green container with a subtle (static, non-pulsing)
 * orange glow behind the content, heading/copy, and two CTAs. The
 * WhatsApp href is built from `phoneNumber` + `message` via
 * `encodeURIComponent` - never hardcoded here, so no approved copy
 * lives inside this component (same pattern as every other homepage
 * section this phase).
 */
export function AllianceCta({ eyebrow, heading, description, primaryAction, whatsapp }: AllianceCtaProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!heading) {
    return null;
  }

  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.phoneNumber}?text=${encodeURIComponent(whatsapp.message)}` : undefined;

  return (
    <section id="aliados" aria-labelledby="alliance-heading" className="marketing-section">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EASE }}
        className="relative isolate overflow-hidden rounded-[36px] border border-white/10 bg-brand-deep px-6 py-16 text-center shadow-e4 sm:px-12 sm:py-20"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-orange opacity-25 blur-3xl"
        />

        <div className="relative mx-auto max-w-2xl">
          {eyebrow && (
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-white">
              {eyebrow}
            </span>
          )}
          <h2 id="alliance-heading" className={cn("font-display text-3xl font-semibold text-white sm:text-4xl", eyebrow && "mt-4")}>
            {heading}
          </h2>
          {description && <p className="mt-3 text-base text-white/80">{description}</p>}

          {(primaryAction || whatsapp) && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              {primaryAction && (
                <Link
                  to={primaryAction.href}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-brand-orange px-6 text-sm font-medium text-white transition-colors hover:bg-brand-orange-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep"
                >
                  {primaryAction.label}
                </Link>
              )}
              {whatsapp && whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${whatsapp.label} (se abre en una pestaña nueva de WhatsApp)`}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep"
                >
                  {whatsapp.label}
                </a>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
}
