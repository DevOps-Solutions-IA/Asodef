import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

// Premium redesign: primary/secondary hover now darkens within the same
// hue (brand-dark-600) plus a subtle e1 lift, rather than swapping to a
// second brand color outright - a more refined, "considered" hover than
// an abrupt hue change, while the orange accent stays reserved for CTAs
// that specifically want it (Hero/AllianceCta already pass their own
// className overrides where that's the intent).
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "border border-brand-dark-600/60 bg-brand-dark text-white shadow-e1 hover:-translate-y-0.5 hover:bg-brand-dark-600 hover:shadow-e2 focus-visible:ring-brand-dark",
  secondary:
    "bg-white/80 border border-brand-dark/10 text-brand-dark shadow-e1 hover:border-brand-dark/20 hover:bg-brand-dark-50 hover:shadow-e2 focus-visible:ring-brand-dark",
  outline: "border border-border-soft bg-transparent text-text-main hover:border-brand-dark/20 hover:bg-bg-soft focus-visible:ring-brand-dark",
  ghost: "bg-transparent text-text-main hover:bg-bg-soft focus-visible:ring-brand-dark",
  danger: "bg-danger text-white shadow-e1 hover:bg-danger/90 hover:shadow-e2 focus-visible:ring-danger",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading = false, disabled, iconLeft, iconRight, children, ...props },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={props.type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium",
          "relative isolate overflow-hidden transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out",
          "active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner size="sm" aria-hidden="true" /> : iconLeft}
        {children}
        {!loading && iconRight}
      </button>
    );
  },
);
Button.displayName = "Button";
