import fullLogo from "../../assets/asodef-logo.webp";
import compactLogo from "../../assets/asodef-logo-compact.webp";

export interface BrandLogoProps {
  /** "compact" (icon + wordmark) fits tight nav/sidebar contexts; "full"
   * (+ tagline) is used where more vertical space is available (footer,
   * auth screens). */
  variant?: "full" | "compact";
  className?: string;
}

/**
 * Official ASODEF brand mark (public-frontend correction, Section 4).
 *
 * Real, official assets - the user supplied the original transparent
 * lockup (`asodef-logo.webp`, lossless WebP with alpha) after the first
 * correction pass flagged that no such file existed anywhere in the
 * supplied dossier. `asodef-logo-compact.webp` is a pixel crop of that
 * same original (icon + wordmark only, tagline row removed) - no redraw/
 * recolor/redesign/typography change - for contexts too short for the
 * full lockup (navbar, sidebars, mobile drawer).
 *
 * The wordmark is dark green and reads fine directly on light
 * backgrounds, but is genuinely low-contrast against the brand's own
 * dark green (#003F2D) - callers placing this over a dark background
 * (see PublicLayout's footer, CompanyLayout, PaymentLayout) wrap it in
 * a small white card rather than rely on a color filter, which would
 * misrender a multi-color asset.
 */
export function BrandLogo({ variant = "compact", className = "h-9 w-auto" }: BrandLogoProps) {
  const src = variant === "full" ? fullLogo : compactLogo;
  return <img src={src} alt="ASODEF S.A.S." className={className} />;
}
