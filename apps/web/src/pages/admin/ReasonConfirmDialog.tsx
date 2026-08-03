import { useEffect, useId, useState } from "react";
import { Alert, Button, Dialog, FieldError, Label, Textarea } from "@asodef/ui";

export interface ReasonConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  isPending: boolean;
  errorMessage?: string | null;
}

/**
 * Shared "explain why, then confirm" dialog for every high-impact admin
 * action (US-011 section 14: "safe confirmation for destructive/high-
 * risk actions" + "reason field required"). Built on packages/ui's Dialog
 * (native <dialog>, so focus trap/Escape/backdrop-close come for free).
 */
export function ReasonConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive = false,
  isPending,
  errorMessage,
}: ReasonConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const reasonError = touched && reason.trim().length === 0 ? "Debes indicar un motivo para esta acción." : undefined;

  function handleConfirm() {
    setTouched(true);
    if (reason.trim().length === 0 || isPending) return;
    onConfirm(reason.trim());
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex flex-col gap-4">
        {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
        <div>
          <Label htmlFor={fieldId} required>
            Motivo
          </Label>
          <div className="mt-1.5">
            <Textarea
              id={fieldId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? errorId : undefined}
              rows={3}
            />
          </div>
          <FieldError id={errorId}>{reasonError}</FieldError>
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" variant={destructive ? "danger" : "primary"} onClick={handleConfirm} loading={isPending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
