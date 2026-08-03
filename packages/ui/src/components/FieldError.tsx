import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export interface FieldErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
}

/** Renders nothing when there's no message - callers can pass a possibly-undefined error directly. */
export function FieldError({ className, children, ...props }: FieldErrorProps) {
  if (!children) {
    return null;
  }

  return (
    <p role="alert" className={cn("mt-1.5 text-sm text-danger", className)} {...props}>
      {children}
    </p>
  );
}
