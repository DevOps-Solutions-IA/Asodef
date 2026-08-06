import type { ReactNode } from "react";

export function MobileStickyActionBar({ children, label = "Acciones disponibles" }: { children: ReactNode; label?: string }) {
  return <nav aria-label={label} className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-brand-dark/10 bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(21,58,44,.10)] backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:shadow-none sm:backdrop-blur-none"><div className="grid gap-2 min-[360px]:grid-cols-2">{children}</div></nav>;
}
