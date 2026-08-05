import fullLogo from "../../assets/asodef-logo.webp";
import compactLogo from "../../assets/asodef-logo-compact.webp";
import iconLogo from "../../assets/asodef-logo-icon.webp";

export interface BrandLogoProps {
  /** "compact" (icon + wordmark) fits tight nav/sidebar contexts on a
   * light background; "full" (+ tagline) is used where more vertical
   * space is available (footer, auth screens); "icon" (mark only, no
   * text) is for dark backgrounds - see doc comment below. */
  variant?: "full" | "compact" | "icon";
  className?: string;
}

/**
 * Official ASODEF brand mark (public-frontend correction, Section 4).
 *
 * Real, official assets - the user supplied the original transparent
 * lockup and isotipo (both lossless WebP with alpha) after the first
 * correction pass flagged that no such files existed anywhere in the
 * supplied dossier. `asodef-logo-compact.webp` is a pixel crop of the
 * lockup (icon + wordmark only, tagline row removed) - no redraw/
 * recolor/redesign/typography change - for contexts too short for the
 * full lockup (navbar, sidebars, mobile drawer).
 *
 * The wordmark is dark green and reads fine on light backgrounds, but
 * is genuinely low-contrast against the brand's own dark green
 * (#003F2D) - confirmed by compositing onto that exact color. Rather
 * than paper over that with a white card behind a "transparent" logo
 * (which defeats the point of having a transparent asset at all),
 * callers on a dark background use variant="icon": the isotipo alone,
 * whose colors (orange/yellow house, green trees) all read clearly
 * against dark green with no wordmark text to lose contrast. See
 * PublicLayout's footer, CompanyLayout, and PaymentLayout.
 */
export function BrandLogo({ variant = "compact", className = "h-9 w-auto" }: BrandLogoProps) {
  const src = variant === "full" ? fullLogo : variant === "icon" ? iconLogo : compactLogo;
  return <img src={src} alt="ASODEF S.A.S." className={className} />;
}
