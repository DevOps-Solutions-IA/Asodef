import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../cn";
import { Input } from "./Input";
import { IconButton } from "./IconButton";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * A password field with a visibility toggle (US-010 section 1/10). The
 * toggle is a real <button> (via IconButton), so it is keyboard-reachable
 * and operable by default - no extra keyboard handling needed - and
 * always carries an accessible name describing what it currently does
 * ("Mostrar"/"Ocultar contraseña"), not a static, quickly-stale label.
 * Toggling visibility never clears or resets the field's value.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <IconButton
        type="button"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        icon={visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        variant="ghost"
        size="sm"
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
        onClick={() => setVisible((current) => !current)}
      />
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
