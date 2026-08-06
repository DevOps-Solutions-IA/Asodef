import type { HTMLAttributes, ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { usePrefersReducedMotion } from "@asodef/ui";
import { useRef } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface SafeRevealProps extends Pick<HTMLAttributes<HTMLDivElement>, "className" | "id"> {
  children: ReactNode;
  delay?: number;
}

/**
 * A progressive enhancement reveal: its initial state is deliberately still
 * visible, so content never depends on IntersectionObserver or animation.
 */
export function SafeReveal({ children, className, id, delay = 0 }: SafeRevealProps) {
  const reduced = usePrefersReducedMotion();
  return <motion.div id={id} className={className} initial={reduced ? false : { opacity: 0.96, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : delay, ease: EASE }}>{children}</motion.div>;
}

export function StaggeredItems({ children, className }: { children: readonly ReactNode[]; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return <div className={className}>{children.map((child, index) => <motion.div key={index} initial={reduced ? false : { opacity: 0.96, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: reduced ? 0 : 0.42, delay: reduced ? 0 : Math.min(index * 0.06, 0.3), ease: EASE }}>{child}</motion.div>)}</div>;
}

export function InteractiveSurface({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return <motion.div className={className} whileHover={reduced ? undefined : { y: -3 }} whileTap={reduced ? undefined : { scale: 0.99 }} transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}>{children}</motion.div>;
}

export function SelectionFeedback({ selected, children, className }: { selected: boolean; children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return <motion.div data-selected={selected || undefined} className={className} animate={reduced ? undefined : { scale: selected ? 1.015 : 1 }} transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}>{children}</motion.div>;
}

export function ConnectionPulse({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return <motion.span aria-hidden="true" className={`block h-2 w-2 rounded-full bg-brand-orange ${className ?? ""}`} animate={reduced ? undefined : { opacity: [0.4, 1, 0.4], scale: [0.85, 1.1, 0.85] }} transition={reduced ? { duration: 0 } : { duration: 2.4, ease: "easeInOut", repeat: Infinity }} />;
}

export function OnceInView({ children }: { children: (entered: boolean) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useInView(ref, { once: true, amount: 0.35 });
  return <div ref={ref}>{children(entered)}</div>;
}
