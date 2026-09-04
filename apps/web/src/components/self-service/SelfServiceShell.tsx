import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Drawer, IconButton, cn } from "@asodef/ui";
import { Menu, ShieldCheck, type LucideIcon } from "lucide-react";
import { BrandLogo } from "../../layouts/shared/BrandLogo";
import { SkipToContent } from "../../layouts/shared/SkipToContent";
import { useFocusMainOnRouteChange } from "../../layouts/shared/useFocusMainOnRouteChange";

export interface SelfServiceNavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

function PortalNav({ items, label, onNavigate }: { items: readonly SelfServiceNavItem[]; label: string; onNavigate?: () => void }) {
  return <nav aria-label={label} className="p-3"><ul className="space-y-1">{items.map(({ to, label: itemLabel, icon: Icon, end }) => <li key={to}><NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => cn("flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange", isActive ? "bg-brand-dark text-white" : "text-text-muted hover:bg-brand-dark-50 hover:text-brand-dark")}><Icon aria-hidden="true" className="h-[18px] w-[18px]" />{itemLabel}</NavLink></li>)}</ul></nav>;
}

export function SelfServiceShell({ title, navLabel, items, footer }: { title: string; navLabel: string; items: readonly SelfServiceNavItem[]; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnRouteChange(mainRef);
  useEffect(() => setOpen(false), [location.pathname]);
  return <div className="workspace-canvas min-h-screen lg:flex">
    <SkipToContent targetId="main-content" />
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-brand-dark/10 bg-white/95 shadow-e2 lg:flex"><div className="border-b border-brand-dark/10 px-5 py-5"><Link to="/"><BrandLogo className="h-9 w-auto" /></Link><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">{title}</p></div><PortalNav items={items} label={navLabel} /><div className="mt-auto border-t border-brand-dark/10 p-5 text-xs text-text-muted">{footer}</div></aside>
    <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 border-b border-brand-dark/10 bg-white/90 shadow-e1 backdrop-blur-xl"><div className="flex h-[var(--workspace-topbar-height)] items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><IconButton aria-label="Abrir navegación" icon={<Menu className="h-5 w-5" />} onClick={() => setOpen(true)} className="lg:hidden" /><p className="font-display text-lg font-semibold text-brand-dark">{title}</p></div><p className="hidden items-center gap-2 text-xs text-text-muted sm:flex"><ShieldCheck className="h-4 w-4 text-brand-green" />Sesión activa</p></div></header><main id="main-content" ref={mainRef} tabIndex={-1} className="px-4 py-6 focus:outline-none sm:px-6 lg:px-8"><div className="mx-auto max-w-[1440px]"><Outlet /></div></main></div>
    <Drawer open={open} onClose={() => setOpen(false)} side="left" title={title} description={navLabel}><PortalNav items={items} label={navLabel} onNavigate={() => setOpen(false)} /><div className="border-t border-brand-dark/10 p-5 text-xs text-text-muted">{footer}</div></Drawer>
  </div>;
}
