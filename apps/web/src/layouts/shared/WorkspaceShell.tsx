import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { Drawer, IconButton, cn } from "@asodef/ui";
import { Menu, ShieldCheck, type LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/auth/auth-context";
import { BrandLogo } from "./BrandLogo";
import { LogoutButton } from "./LogoutButton";
import { SkipToContent } from "./SkipToContent";
import { useFocusMainOnRouteChange } from "./useFocusMainOnRouteChange";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: true;
  permission?: string | null;
}

export interface WorkspaceShellProps {
  productLabel: string;
  navLabel: string;
  navItems: WorkspaceNavItem[];
  tone?: "light" | "dark";
  footerLinks?: ReactNode;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es"))
    .join("");
}

function WorkspaceNavigation({ items, tone, label, onNavigate }: { items: WorkspaceNavItem[]; tone: "light" | "dark"; label: string; onNavigate?: () => void }) {
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-base ease-enterprise",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2",
                    tone === "dark" ? "focus-visible:ring-offset-brand-deep" : "focus-visible:ring-offset-white",
                    isActive
                      ? tone === "dark"
                        ? "bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-brand-orange"
                        : "bg-brand-dark text-white shadow-e2 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-brand-orange"
                      : tone === "dark"
                        ? "text-white/72 hover:translate-x-0.5 hover:bg-white/[0.07] hover:text-white"
                        : "text-text-muted hover:translate-x-0.5 hover:bg-brand-dark-50 hover:text-brand-dark",
                  )
                }
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 opacity-80 transition-opacity group-hover:opacity-100" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function WorkspaceShell({ productLabel, navLabel, navItems, tone = "light", footerLinks }: WorkspaceShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const { user, hasPermission } = useAuth();
  useFocusMainOnRouteChange(mainRef);

  const visibleItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));
  const dark = tone === "dark";

  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  function closeMobileNav() {
    setMobileNavOpen(false);
    menuButtonRef.current?.focus();
  }

  const brandBlock = (
    <div className={cn("border-b px-5 py-5", dark ? "border-white/10" : "border-brand-dark/10")}>
      <Link to="/" aria-label={ASODEF_COMPANY.legalName} className="inline-flex">
        <BrandLogo variant={dark ? "icon" : "full"} className={cn("w-auto", dark ? "h-10" : "h-9")} />
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <span className={cn("h-px w-7", dark ? "bg-brand-orange" : "bg-brand-orange")} aria-hidden="true" />
        <p className={cn("text-[10px] font-bold uppercase tracking-[0.18em]", dark ? "text-white/60" : "text-text-muted")}>{productLabel}</p>
      </div>
    </div>
  );

  return (
    <div className="workspace-canvas min-h-screen lg:flex">
      <SkipToContent targetId="main-content" />

      <aside
        className={cn(
          "sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r shadow-e2 lg:flex",
          dark ? "border-white/10 bg-brand-deep text-white" : "border-brand-dark/10 bg-white/92 backdrop-blur-xl",
        )}
      >
        {brandBlock}
        <p className={cn("px-6 pt-5 text-[10px] font-bold uppercase tracking-[0.16em]", dark ? "text-white/45" : "text-text-muted")}>{navLabel}</p>
        <WorkspaceNavigation items={visibleItems} tone={tone} label={navLabel} />
        <div className={cn("border-t p-3", dark ? "border-white/10" : "border-brand-dark/10")}>
          {footerLinks && <div className={cn("mb-3 flex flex-col gap-1 px-2 text-xs", dark ? "text-white/60" : "text-text-muted")}>{footerLinks}</div>}
          <LogoutButton className={cn("w-full justify-start", dark && "text-white/75 hover:bg-white/10 hover:text-white")} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-brand-dark/10 bg-white/85 shadow-e1 backdrop-blur-xl">
          <div className="flex h-[var(--workspace-topbar-height)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <IconButton
                ref={menuButtonRef}
                aria-label="Abrir navegación"
                icon={<Menu className="h-5 w-5" />}
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden"
              />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-brand-dark sm:text-lg">{productLabel}</p>
                <p className="hidden items-center gap-1.5 text-xs text-text-muted sm:flex">
                  <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-brand-green" />
                  Sesión protegida · controles de acceso activos
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3 rounded-full border border-brand-dark/10 bg-white/80 py-1.5 pl-1.5 pr-3 shadow-e1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-dark font-display text-xs font-semibold text-white">
                {initials(user?.fullName ?? "ASODEF") || "AS"}
              </span>
              <div className="hidden max-w-48 sm:block">
                <p className="truncate text-xs font-semibold text-text-main">{user?.fullName ?? "Usuario ASODEF"}</p>
                <p className="truncate text-[10px] text-text-muted">{user?.roles.join(" · ") || "Sesión activa"}</p>
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" ref={mainRef} tabIndex={-1} className="workspace-main min-w-0 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>

      <Drawer open={mobileNavOpen} onClose={closeMobileNav} title={productLabel} description={navLabel} side="left" className="max-w-[21rem]">
        <div className="-mx-2 flex h-full min-h-0 flex-col">
          <WorkspaceNavigation items={visibleItems} tone="light" label={navLabel} onNavigate={closeMobileNav} />
          <div className="mt-auto border-t border-brand-dark/10 px-3 pt-4">
            {footerLinks && <div className="mb-3 flex flex-col gap-1 px-2 text-xs text-text-muted">{footerLinks}</div>}
            <LogoutButton className="w-full justify-start" />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
