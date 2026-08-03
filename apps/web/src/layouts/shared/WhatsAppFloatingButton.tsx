import { MessageCircle } from "lucide-react";
import { Tooltip } from "@asodef/ui";

export interface WhatsAppFloatingButtonProps {
  /** Digits only, no "+" - e.g. "573232733927". */
  phoneNumber: string;
  tooltip: string;
  ariaLabel: string;
}

/**
 * US-018: site-wide floating shortcut (fixed bottom-5 right-5), not
 * homepage-only - rendered once in PublicLayout so it's reachable from
 * every public page. No prefilled message: unlike AllianceCta's
 * "become a partner" WhatsApp CTA, this is a general contact shortcut
 * with no assumed visitor intent, so it opens a blank chat.
 */
export function WhatsAppFloatingButton({ phoneNumber, tooltip, ariaLabel }: WhatsAppFloatingButtonProps) {
  return (
    <div className="fixed bottom-5 right-5 z-40">
      <span
        aria-hidden="true"
        className="motion-safe:animate-pulse pointer-events-none absolute inset-0 rounded-full bg-brand-green opacity-40"
      />
      <Tooltip content={tooltip} align="end">
        <a
          href={`https://wa.me/${phoneNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-green text-white shadow-lg transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2"
        >
          <MessageCircle aria-hidden="true" className="h-7 w-7" />
        </a>
      </Tooltip>
    </div>
  );
}
