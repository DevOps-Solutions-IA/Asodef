import { ASODEF_COMPANY } from "@asodef/config";
import { Hero } from "./Hero";

/**
 * Institutional homepage (US-012 begins it with the Hero section only).
 * TrustBar/About/Statistics/Benefits/Portfolio/Coverage/Alliance-CTA are
 * separate, later stories - they are not stubbed here.
 *
 * Hero's eyebrow/heading/supportingCopy/stats are intentionally omitted:
 * no confirmed source (project files, PRD, or master-prompt materials)
 * contains the actual hero headline, highlighted phrase, eyebrow text,
 * supporting paragraph, or floating-stat figures - see the US-012
 * completion report. Only CTAs use real, already-confirmed route names
 * from the PRD's own routes list, and the tagline is ASODEF's actual
 * confirmed copy (packages/config's ASODEF_COMPANY), reused as-is
 * rather than invented.
 */
export function HomePage() {
  return (
    <Hero
      supportingCopy={ASODEF_COMPANY.tagline}
      ctas={[
        { label: "Centro de pagos", href: "/pagos", variant: "primary" },
        { label: "Ver portafolio", href: "#portafolio", variant: "outline" },
        { label: "Contáctanos", href: "#contacto", variant: "outline" },
      ]}
    />
  );
}
