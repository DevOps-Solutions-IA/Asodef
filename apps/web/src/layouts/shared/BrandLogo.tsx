import fullLogo from "../../assets/asodef-logo-interim.png";
import compactLogo from "../../assets/asodef-logo-interim-compact.png";

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
 * INTERIM ASSET: cropped directly (pixels only - no redraw/recolor/
 * redesign/typography change) from the official dossier's cover slide,
 * the cleanest and highest-resolution instance of the logo across the
 * 5 slide images supplied. No standalone logo file (vector or
 * transparent raster) existed anywhere in the supplied materials.
 * Kept on its original flat white background: a background-removal
 * attempt produced visible white fringing/halo around the wordmark and
 * tagline strokes, which the correction's own requirements explicitly
 * rule out, so it was discarded rather than shipped mislabeled as true
 * transparency. A standalone original (SVG/AI/EPS/PNG-with-alpha)
 * remains pending from ASODEF for production use.
 */
export function BrandLogo({ variant = "compact", className = "h-9 w-auto" }: BrandLogoProps) {
  const src = variant === "full" ? fullLogo : compactLogo;
  return <img src={src} alt="ASODEF S.A.S." className={className} />;
}
