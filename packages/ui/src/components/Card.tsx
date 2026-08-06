import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "accent" | "inverse";
}

const VARIANT_STYLES: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "border-black/[0.06] bg-white/90 text-text-main",
  subtle: "border-brand-dark/10 bg-brand-dark-50/65 text-text-main",
  accent: "border-brand-dark/15 bg-white text-text-main before:absolute before:inset-y-5 before:left-0 before:w-1 before:rounded-r-full before:bg-brand-orange",
  inverse: "border-white/10 bg-brand-deep text-white",
};

/** Baseline ASODEF surface per the design system: xl3 radius, soft
 * border, translucent white, backdrop blur, e2 elevation (brand-tinted,
 * not flat black - see index.css's elevation scale). */
export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "premium-card-glow relative overflow-hidden rounded-xl3 border p-6 shadow-e2 backdrop-blur-xl",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    />
  );
}
