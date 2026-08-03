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
        "m-auto w-full max-w-lg rounded-[28px] border border-black/[0.06] bg-white p-0 shadow-[0_20px_60px_rgba(0,63,45,0.15)]",
        "backdrop:bg-brand-dark/40 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="p-6" onClick={(event) => event.stopPropagation()}>
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
