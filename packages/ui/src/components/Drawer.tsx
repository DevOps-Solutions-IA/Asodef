import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../cn";
import { IconButton } from "./IconButton";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export type DrawerSide = "left" | "right";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: DrawerSide;
  className?: string;
}

const EXIT_TRANSITION_MS = 200;

/**
 * Same native <dialog> foundation as Dialog (focus trap + Escape +
 * top-layer for free), fixed to one edge of the viewport with a CSS
 * transform slide. The `visible` state is set one frame after `open`
 * flips true so the browser actually paints the off-screen position
 * first - otherwise the enter transition would have nothing to animate
 * from.
 */
export function Drawer({ open, onClose, title, description, children, side = "right", className }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    if (open) {
      if (!node.open) node.showModal();
      if (prefersReducedMotion) {
        setVisible(true);
        return;
      }
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    setVisible(false);
    if (node.open) {
      const delay = prefersReducedMotion ? 0 : EXIT_TRANSITION_MS;
      const timeout = setTimeout(() => node.close(), delay);
      return () => clearTimeout(timeout);
    }
  }, [open, prefersReducedMotion]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const handleClose = () => onClose();
    node.addEventListener("close", handleClose);
    return () => node.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
      className={cn(
        "fixed inset-y-0 m-0 h-full max-h-none w-full max-w-sm border-0 bg-white p-0",
        "shadow-e4",
        "backdrop:bg-brand-dark/40 backdrop:backdrop-blur-sm",
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        side === "right" ? "right-0 left-auto" : "left-0 right-auto",
        visible ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full",
        className,
      )}
    >
      <div className="flex h-full flex-col p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-text-main">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton
            aria-label="Cerrar"
            icon={<X className="h-4 w-4" />}
            size="sm"
            onClick={() => dialogRef.current?.close()}
          />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
