import type { ReactNode } from "react";
import { cn } from "../cn";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

/** Reusable eyebrow + heading + description pattern used across marketing
 * sections (Hero, Statistics, Portfolio, etc. - built out in later stories). */
export function SectionHeading({ eyebrow, title, description, align = "left", className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <span className="inline-flex rounded-full border border-brand-dark/15 bg-white/70 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-brand-dark backdrop-blur">
          {eyebrow}
        </span>
      )}
      <h2 className={cn("font-display text-3xl font-semibold text-text-main sm:text-4xl", eyebrow && "mt-4")}>
        {title}
      </h2>
      {description && <p className="mt-3 text-base text-text-muted">{description}</p>}
    </div>
  );
}
