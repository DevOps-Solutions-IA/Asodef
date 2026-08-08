import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { Drawer, IconButton } from "@asodef/ui";
import { ArrowRight, Building2, ChevronDown, CreditCard, LockKeyhole, Menu, ShieldCheck, UserRound } from "lucide-react";
import { PUBLIC_ROUTES } from "../../lib/public-content/public-routes";
import { BrandLogo } from "./BrandLogo";

const primaryRoutes = [PUBLIC_ROUTES.about, PUBLIC_ROUTES.benefits, PUBLIC_ROUTES.solutions, PUBLIC_ROUTES.companies];
const resourceRoutes = [PUBLIC_ROUTES.pqr, PUBLIC_ROUTES.dsr];
const accessRoutes = [
  { label: "Afiliados", description: "Consulta y gestiona los servicios asociados a tu vinculación.", path: "/mi-cuenta/acceso", icon: UserRound },
  { label: "Empresas", description: "Acceso para organizaciones registradas en ASODEF.", path: "/empresa/acceso", icon: Building2 },
  { label: "Acceso administrativo", description: "Ingreso exclusivo para personal autorizado.", path: "/iniciar-sesion", icon: LockKeyhole },
] as const;

function AccessDestination({ item, compact = false }: { item: (typeof accessRoutes)[number]; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => `group flex w-full items-start gap-3 rounded-2xl border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 motion-reduce:transition-none ${compact ? "min-h-16 px-3 py-3" : "min-h-20 p-4"} ${isActive ? "border-brand-dark/25 bg-brand-dark text-white shadow-e2" : "border-brand-dark/10 bg-white text-brand-dark hover:-translate-y-0.5 hover:border-brand-dark/25 hover:bg-brand-dark-50 hover:shadow-e2 motion-reduce:transform-none"}`}
    >
      {({ isActive }) => <>
        <span className={`flex shrink-0 items-center justify-center rounded-xl ${compact ? "h-9 w-9" : "h-10 w-10"} ${isActive ? "bg-white/10 text-white ring-1 ring-white/20" : "bg-brand-dark-50 text-brand-dark ring-1 ring-brand-dark/10"}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{item.label}</span>
          <span className={`mt-1 block text-xs leading-5 ${isActive ? "text-white/75" : "text-text-muted group-hover:text-text-main"}`}>{item.description}</span>
        </span>
        <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-brand-orange transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
      </>}
    </NavLink>
  );
}

/**
 * The single authoritative header for every anonymous/public surface.
 * Public, auth and payments layouts reuse this component so their navigation
 * hierarchy, mobile drawer and transactional actions cannot drift, including
 * the Legal Center's shared top-level navigation.
 */
export function PublicHeader() {
  const menuRef = useRef<HTMLLIElement>(null);
  const accessMenuRef = useRef<HTMLLIElement>(null);
  const accessButtonRef = useRef<HTMLButtonElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [mobileAccessOpen, setMobileAccessOpen] = useState(false);
  const accessActive = accessRoutes.some((item) => location.pathname === item.path);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setResourcesOpen(false);
    setAccessOpen(false);
    setMobileAccessOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!resourcesOpen && !accessOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setResourcesOpen(false);
      if (!accessMenuRef.current?.contains(event.target as Node)) setAccessOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const restoreAccessFocus = accessOpen;
        setResourcesOpen(false);
        setAccessOpen(false);
        if (restoreAccessFocus) requestAnimationFrame(() => accessButtonRef.current?.focus());
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [resourcesOpen, accessOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  };

  return (
    <>
      <header className={`sticky top-0 z-40 border-b transition ${scrolled ? "border-brand-dark/10 bg-[#F4F5F1]/92 shadow-e2 backdrop-blur-2xl" : "border-transparent bg-bg-base/80 backdrop-blur-xl"}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-2.5 sm:px-8 sm:py-3 lg:px-12">
          <Link to="/" aria-label={`${ASODEF_COMPANY.legalName}, inicio`}>
            <BrandLogo className="h-9 w-auto sm:h-10" />
          </Link>

          <nav aria-label="Principal" className="ml-auto hidden items-center lg:flex">
            <ul className="flex items-center gap-1">
              <li><NavLink to="/" end className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? "bg-brand-dark/8 text-brand-dark" : "text-text-muted hover:text-brand-dark"}`}>Inicio</NavLink></li>
              {primaryRoutes.map((item) => <li key={item.path}><NavLink to={item.path} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? "bg-brand-dark/8 text-brand-dark" : "text-text-muted hover:text-brand-dark"}`}>{item.label}</NavLink></li>)}
              <li ref={menuRef} className="relative">
                <button aria-expanded={resourcesOpen} aria-controls="resource-menu" onClick={() => { setResourcesOpen((value) => !value); setAccessOpen(false); }} className="flex min-h-10 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-text-muted hover:text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2">
                  Recursos
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition motion-reduce:transition-none ${resourcesOpen ? "rotate-180" : ""}`} />
                </button>
                {resourcesOpen && <div id="resource-menu" className="absolute right-0 top-12 w-[28rem] rounded-3xl border border-brand-dark/10 bg-white p-3 shadow-e4"><div className="grid grid-cols-2 gap-2">{resourceRoutes.map((item) => <Link key={item.path} to={item.path} className="min-h-24 rounded-2xl p-4 hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"><span className="font-semibold text-brand-dark">{item.label}</span><span className="mt-1 block text-xs leading-5 text-text-muted">{item.description}</span></Link>)}</div></div>}
              </li>
              <li ref={accessMenuRef} className="relative">
                <button ref={accessButtonRef} aria-expanded={accessOpen} aria-controls="access-menu" onClick={() => { setAccessOpen((value) => !value); setResourcesOpen(false); }} className={`flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none ${accessOpen || accessActive ? "border-brand-dark bg-brand-dark text-white" : "border-brand-dark/20 bg-white/80 text-brand-dark hover:border-brand-dark/35 hover:bg-brand-dark-50"}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${accessOpen || accessActive ? "bg-white/10" : "bg-brand-dark-50"}`}><ShieldCheck aria-hidden="true" className={`h-4 w-4 ${accessOpen || accessActive ? "text-brand-orange-200" : "text-brand-green"}`} /></span>
                  <span>Accesos</span>
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition motion-reduce:transition-none ${accessOpen ? "rotate-180" : ""}`} />
                </button>
                {accessOpen && <div id="access-menu" className="absolute right-0 top-[calc(100%+0.75rem)] w-[27rem] rounded-3xl border border-brand-dark/15 bg-bg-base/98 p-3 shadow-e4 backdrop-blur-xl"><div className="mb-2 flex items-center gap-2 px-2 py-1"><span className="h-1.5 w-1.5 rounded-full bg-brand-orange" /><span className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">Elige tu acceso</span></div><div className="grid gap-2">{accessRoutes.map((item) => <AccessDestination key={item.path} item={item} />)}</div></div>}
              </li>
            </ul>
          </nav>

          <div aria-label="Acciones de navegación" className="hidden items-center gap-2 lg:flex">
            <Link to="/pagos" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-brand-orange px-4 text-sm font-bold text-brand-deep shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"><CreditCard aria-hidden="true" className="h-4 w-4" />Pagar</Link>
            <Link to="/comenzar" className="public-button-primary !min-h-10 !px-4">Recibir orientación<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>

          <IconButton ref={hamburgerRef} aria-label="Abrir menú de navegación" icon={<Menu className="h-5 w-5" />} className="ml-auto !h-11 !w-11 sm:!h-12 sm:!w-12 lg:hidden" onClick={() => setDrawerOpen(true)} />
        </div>
      </header>

      <Drawer open={drawerOpen} onClose={closeDrawer} title="Navegación" description="Accesos públicos de ASODEF" side="right" className="max-w-[24rem]">
        <div className="mb-5 border-b border-brand-dark/10 pb-5"><BrandLogo className="h-9 w-auto" /></div>
        <nav aria-label="Principal móvil">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-text-muted">Conocer ASODEF</p>
          <ul className="mt-2 grid gap-1">{primaryRoutes.map((item) => <li key={item.path}><NavLink to={item.path} className={({ isActive }) => `flex min-h-12 items-center rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${isActive ? "bg-brand-dark text-white" : "text-text-main hover:bg-bg-soft"}`}>{item.label}</NavLink></li>)}</ul>
          <div className="my-5 border-t border-brand-dark/10" />
          <p className="text-xs font-bold uppercase tracking-[.14em] text-text-muted">Recursos</p>
          <ul className="mt-2 grid grid-cols-2 gap-2">{resourceRoutes.map((item) => <li key={item.path}><NavLink to={item.path} className={({ isActive }) => `flex min-h-14 items-center rounded-xl px-3 py-2 text-sm font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${isActive ? "bg-brand-dark text-white" : "bg-bg-soft text-brand-dark hover:bg-brand-dark/10"}`}>{item.label}</NavLink></li>)}</ul>
          <div className="my-5 border-t border-brand-dark/10" />
          <button type="button" aria-expanded={mobileAccessOpen} aria-controls="mobile-access-menu" onClick={() => setMobileAccessOpen((value) => !value)} className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-brand-dark/20 bg-brand-dark-50 px-3 text-left text-sm font-bold text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-brand-green" />
            <span className="flex-1">Accesos</span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition motion-reduce:transition-none ${mobileAccessOpen ? "rotate-180" : ""}`} />
          </button>
          {mobileAccessOpen && <ul id="mobile-access-menu" className="mt-2 grid gap-2">{accessRoutes.map((item) => <li key={item.path}><AccessDestination item={item} compact /></li>)}</ul>}
        </nav>
        <div aria-label="Acciones principales" className="mt-5 grid gap-2 border-t border-brand-dark/10 pt-5">
          <Link to="/pagos" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-bold text-brand-deep shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"><CreditCard aria-hidden="true" className="h-4 w-4" />Pagar</Link>
          <Link to="/comenzar" className="public-button-primary w-full justify-center">Recibir orientación<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </Drawer>
    </>
  );
}
