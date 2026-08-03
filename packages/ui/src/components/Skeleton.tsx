import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Purely decorative - hidden from assistive tech; pair with a visible or
 * sr-only loading announcement in the parent (e.g. an Alert/Spinner). */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-bg-soft", className)} {...props} />;
}
