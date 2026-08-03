import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Baseline ASODEF surface per the design system: rounded-[28px], soft
 * border, translucent white, backdrop blur, soft shadow (section 8). */
export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-black/[0.06] bg-white/80 p-6 shadow-[0_20px_60px_rgba(0,63,45,0.08)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
