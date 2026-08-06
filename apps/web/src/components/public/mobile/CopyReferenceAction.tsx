import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyReferenceAction({ value, label = "Copiar referencia" }: { value: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => { if (status === "idle") return; const timeout = window.setTimeout(() => setStatus("idle"), 2500); return () => window.clearTimeout(timeout); }, [status]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  };
  return <div><button type="button" onClick={copy} className="public-button-secondary" aria-label={`${label}: ${value}`}>{status === "copied" ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}{status === "copied" ? "Referencia copiada" : status === "error" ? "No se pudo copiar" : label}</button><p className={`mt-2 max-w-xs text-xs leading-5 ${status === "error" ? "text-text-muted" : "font-semibold text-success"}`} aria-live="polite">{status === "copied" ? `Referencia ${value} copiada.` : status === "error" ? "No fue posible copiar automáticamente. Usa las opciones de copia de tu dispositivo sobre la referencia mostrada." : ""}</p></div>;
}
