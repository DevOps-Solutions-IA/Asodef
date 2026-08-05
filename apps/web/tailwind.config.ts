import type { Config } from "tailwindcss";

/**
 * Color keys intentionally mirror the ASODEF CSS custom property suffixes
 * (see src/styles/tokens.css) so a token name is traceable end to end:
 * --color-brand-dark -> theme color "brand-dark" -> utility "bg-brand-dark".
 */
export default {
  // packages/ui's components are consumed by this app but built/authored
  // outside src/ - without scanning them here too, Tailwind's JIT scanner
  // would never see their utility classes and would silently omit that
  // CSS from the final build (the components would render unstyled).
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "brand-dark": "var(--color-brand-dark)",
        "brand-deep": "var(--color-brand-deep)",
        "brand-green": "var(--color-brand-green)",
        "brand-light": "var(--color-brand-light)",
        "brand-orange": "var(--color-brand-orange)",
        "brand-orange-light": "var(--color-brand-orange-light)",
        // Full tonal ramps (premium redesign) - e.g. bg-brand-dark-100,
        // text-brand-orange-700 - for a precise weight of the brand
        // hues without hand-mixing opacity.
        "brand-dark-50": "var(--color-brand-dark-50)",
        "brand-dark-100": "var(--color-brand-dark-100)",
        "brand-dark-200": "var(--color-brand-dark-200)",
        "brand-dark-300": "var(--color-brand-dark-300)",
        "brand-dark-400": "var(--color-brand-dark-400)",
        "brand-dark-500": "var(--color-brand-dark-500)",
        "brand-dark-600": "var(--color-brand-dark-600)",
        "brand-dark-700": "var(--color-brand-dark-700)",
        "brand-dark-800": "var(--color-brand-dark-800)",
        "brand-dark-900": "var(--color-brand-dark-900)",
        "brand-orange-50": "var(--color-brand-orange-50)",
        "brand-orange-100": "var(--color-brand-orange-100)",
        "brand-orange-200": "var(--color-brand-orange-200)",
        "brand-orange-300": "var(--color-brand-orange-300)",
        "brand-orange-400": "var(--color-brand-orange-400)",
        "brand-orange-500": "var(--color-brand-orange-500)",
        "brand-orange-600": "var(--color-brand-orange-600)",
        "brand-orange-700": "var(--color-brand-orange-700)",
        "brand-orange-800": "var(--color-brand-orange-800)",
        "brand-orange-900": "var(--color-brand-orange-900)",
        neutral: {
          0: "var(--color-neutral-0)",
          50: "var(--color-neutral-50)",
          100: "var(--color-neutral-100)",
          200: "var(--color-neutral-200)",
          300: "var(--color-neutral-300)",
          400: "var(--color-neutral-400)",
          500: "var(--color-neutral-500)",
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)",
          800: "var(--color-neutral-800)",
          900: "var(--color-neutral-900)",
        },
        "bg-base": "var(--color-bg-base)",
        "bg-soft": "var(--color-bg-soft)",
        "bg-elevated": "var(--color-bg-elevated)",
        "text-main": "var(--color-text-main)",
        "text-muted": "var(--color-text-muted)",
        "border-soft": "var(--color-border-soft)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
        accent: ["Caveat", "cursive"],
      },
      boxShadow: {
        // Elevation scale (premium redesign) - brand-tinted, not flat
        // black, matching the technique already used ad hoc in Card/
        // Dialog/Drawer/Hero before this. e1 = resting card lift, e2 =
        // dropdown/hover-raise, e3 = modal/drawer, e4 = toast/max depth.
        e1: "var(--shadow-e1)",
        e2: "var(--shadow-e2)",
        e3: "var(--shadow-e3)",
        e4: "var(--shadow-e4)",
      },
      borderRadius: {
        // Formal radius scale layered on top of Tailwind's defaults -
        // xl2/xl3 fill the gap between the stock 1rem/1.5rem steps and
        // the app's existing rounded-[28px] custom cards, so new
        // components can reach for a named step instead of another
        // one-off arbitrary value.
        xl2: "1.25rem",
        xl3: "1.75rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
