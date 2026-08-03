import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";
import { Spinner } from "./Spinner";
import type { ButtonVariant } from "./Button";

export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required: an icon-only control must always have an accessible name. */
  "aria-label": string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-brand-dark text-white hover:bg-brand-orange focus-visible:ring-brand-dark",
  secondary:
    "bg-white/80 border border-brand-dark/10 text-brand-dark hover:bg-brand-orange hover:text-white focus-visible:ring-brand-dark",
  outline: "border border-border-soft bg-transparent text-text-main hover:bg-bg-soft focus-visible:ring-brand-dark",
  ghost: "bg-transparent text-text-main hover:bg-bg-soft focus-visible:ring-brand-dark",
  danger: "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger",
};

const SIZE_STYLES: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "md", loading = false, disabled, icon, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={props.type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner size="sm" aria-hidden="true" /> : icon}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
