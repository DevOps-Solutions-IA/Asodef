import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "../cn";

export type AlertVariant = "info" | "success" | "warning" | "danger";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: AlertVariant;
  title?: ReactNode;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: "bg-info/10 text-info border-info/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-danger/10 text-danger border-danger/20",
};

const VARIANT_ICONS: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const Icon = VARIANT_ICONS[variant];
  // Warnings/errors interrupt (assertive); info/success are announced
  // politely so they don't cut off whatever the user is currently doing.
  const role = variant === "danger" || variant === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn("flex gap-3 rounded-2xl border p-4 text-sm", VARIANT_STYLES[variant], className)}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-1", "text-text-main")}>{children}</div>
      </div>
    </div>
  );
}
