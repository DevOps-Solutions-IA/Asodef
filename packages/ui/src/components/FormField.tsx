import { useId } from "react";
import type { ReactNode } from "react";
import { Label } from "./Label";
import { FieldError } from "./FieldError";
import { cn } from "../cn";

export interface FormFieldControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  required: boolean | undefined;
}

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  /** Render-prop so FormField works with Input, Textarea, Select, or a
   * custom control, while still owning id/aria-describedby/aria-invalid. */
  children: (controlProps: FormFieldControlProps) => ReactNode;
}

export function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  const generatedId = useId();
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col", className)}>
      <Label htmlFor={generatedId} required={required}>
        {label}
      </Label>
      <div className="mt-1.5">
        {children({
          id: generatedId,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
          required,
        })}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-sm text-text-muted">
          {hint}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
