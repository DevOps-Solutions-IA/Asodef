import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Baseline ASODEF surface per the design system: xl3 radius, soft
 * border, translucent white, backdrop blur, e2 elevation (brand-tinted,
 * not flat black - see index.css's elevation scale). */
export function Card({ className, ...props }: CardProps) {
  return <div className={cn("rounded-xl3 border border-black/[0.06] bg-white/80 p-6 shadow-e2 backdrop-blur-xl", className)} {...props} />;
}
