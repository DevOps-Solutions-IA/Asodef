import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../cn";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Built on the native <dialog> element deliberately: showModal() gives a
 * real browser-native focus trap, Escape-to-close, and top-layer stacking
 * for free, without pulling in a focus-trap library. Focus restoration to
 * the trigger element is also native browser behavior on close().
 */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    // Fires for Escape, backdrop-triggered close(), and our own close().
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
        // A click that lands on the <dialog> element itself (not the inner
        // content wrapper) is a backdrop click - close it.
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl3 border border-white/60 bg-white/95 p-0 shadow-e4 backdrop-blur-xl",
        "backdrop:bg-brand-dark/40 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="relative p-6" onClick={(event) => event.stopPropagation()}>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-orange via-brand-light to-brand-dark" />
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
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
