import type { Config } from "tailwindcss";

/**
 * Color keys intentionally mirror the ASODEF CSS custom property suffixes
 * (see src/styles/tokens.css) so a token name is traceable end to end:
 * --color-brand-dark -> theme color "brand-dark" -> utility "bg-brand-dark".
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "brand-dark": "var(--color-brand-dark)",
        "brand-deep": "var(--color-brand-deep)",
        "brand-green": "var(--color-brand-green)",
        "brand-light": "var(--color-brand-light)",
        "brand-orange": "var(--color-brand-orange)",
        "brand-orange-light": "var(--color-brand-orange-light)",
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
    },
  },
  plugins: [],
} satisfies Config;
