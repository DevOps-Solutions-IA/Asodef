import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { Drawer, IconButton } from "@asodef/ui";
import { ArrowRight, ChevronDown, CreditCard, LogIn, Menu } from "lucide-react";
import { PUBLIC_ROUTES } from "../../lib/public-content/public-routes";
import { BrandLogo } from "./BrandLogo";

const primaryRoutes = [PUBLIC_ROUTES.about, PUBLIC_ROUTES.benefits, PUBLIC_ROUTES.solutions, PUBLIC_ROUTES.companies];
const resourceRoutes = [PUBLIC_ROUTES.pqr, PUBLIC_ROUTES.dsr];

/**
 * The single authoritative header for every anonymous/public surface.
 * Public, auth, payments and legal layouts reuse this component so their
 * navigation hierarchy, mobile drawer and transactional actions cannot drift.
 */
export function PublicHeader() {
  const menuRef = useRef<HTMLLIElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setResourcesOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!resourcesOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setResourcesOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setResourcesOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [resourcesOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  };

  return (
    <>
      <header className={`sticky top-0 z-40 border-b transition ${scrolled ? "border-brand-dark/10 bg-[#F4F5F1]/92 shadow-e2 backdrop-blur-2xl" : "border-transparent bg-bg-base/80 backdrop-blur-xl"}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-3 sm:px-8 lg:px-12">
          <Link to="/" aria-label={`${ASODEF_COMPANY.legalName}, inicio`}>
            <BrandLogo className="h-10 w-auto" />
          </Link>

          <nav aria-label="Principal" className="ml-auto hidden items-center lg:flex">
            <ul className="flex items-center gap-1">
              <li><NavLink to="/" end className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? "bg-brand-dark/8 text-brand-dark" : "text-text-muted hover:text-brand-dark"}`}>Inicio</NavLink></li>
              {primaryRoutes.map((item) => <li key={item.path}><NavLink to={item.path} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? "bg-brand-dark/8 text-brand-dark" : "text-text-muted hover:text-brand-dark"}`}>{item.label}</NavLink></li>)}
              <li ref={menuRef} className="relative">
                <button aria-expanded={resourcesOpen} aria-controls="resource-menu" onClick={() => setResourcesOpen((value) => !value)} className="flex min-h-10 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-text-muted hover:text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2">
                  Recursos
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition motion-reduce:transition-none ${resourcesOpen ? "rotate-180" : ""}`} />
                </button>
                {resourcesOpen && <div id="resource-menu" className="absolute right-0 top-12 w-[28rem] rounded-3xl border border-brand-dark/10 bg-white p-3 shadow-e4"><div className="grid grid-cols-2 gap-2">{resourceRoutes.map((item) => <Link key={item.path} to={item.path} className="min-h-24 rounded-2xl p-4 hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"><span className="font-semibold text-brand-dark">{item.label}</span><span className="mt-1 block text-xs leading-5 text-text-muted">{item.description}</span></Link>)}</div></div>}
              </li>
            </ul>
          </nav>

          <div aria-label="Acciones de navegación" className="hidden items-center gap-2 lg:flex">
            <Link to="/pagos" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-brand-orange px-4 text-sm font-bold text-brand-deep shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"><CreditCard aria-hidden="true" className="h-4 w-4" />Pagar</Link>
            <Link to="/iniciar-sesion" className="public-button-secondary !min-h-10 !px-4"><LogIn aria-hidden="true" className="h-4 w-4" />Ingresar</Link>
            <Link to="/comenzar" className="public-button-primary !min-h-10 !px-4">Recibir orientación<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>

          <IconButton ref={hamburgerRef} aria-label="Abrir menú de navegación" icon={<Menu className="h-5 w-5" />} className="ml-auto !h-12 !w-12 lg:hidden" onClick={() => setDrawerOpen(true)} />
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
        </nav>
        <div aria-label="Acciones principales" className="mt-5 grid gap-2 border-t border-brand-dark/10 pt-5">
          <Link to="/pagos" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-orange px-4 text-sm font-bold text-brand-deep shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"><CreditCard aria-hidden="true" className="h-4 w-4" />Pagar</Link>
          <Link to="/iniciar-sesion" className="public-button-secondary w-full justify-center"><LogIn aria-hidden="true" className="h-4 w-4" />Ingresar</Link>
          <Link to="/comenzar" className="public-button-primary w-full justify-center">Recibir orientación<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </Drawer>
    </>
  );
}
