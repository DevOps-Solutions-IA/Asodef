import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { Drawer, IconButton } from "@asodef/ui";
import { ArrowRight, ChevronDown, LogIn, Menu, ShieldCheck, X } from "lucide-react";
import { PUBLIC_NAV_GROUPS, PUBLIC_ROUTES } from "../lib/public-content/public-routes";
import { useCookieConsent } from "../lib/cookie-consent/cookie-consent-context";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { useScrollToHash } from "./shared/useScrollToHash";
import { WhatsAppFloatingButton } from "./shared/WhatsAppFloatingButton";

const WHATSAPP_NUMBER = "573232733927";
const primary = [PUBLIC_ROUTES.about, PUBLIC_ROUTES.benefits, PUBLIC_ROUTES.solutions, PUBLIC_ROUTES.companies];

export function PublicLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLLIElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { openPreferences } = useCookieConsent();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  useFocusMainOnRouteChange(mainRef); useScrollToHash();

  useEffect(() => { const onScroll=()=>setScrolled(window.scrollY>8); onScroll(); window.addEventListener("scroll",onScroll,{passive:true}); return()=>window.removeEventListener("scroll",onScroll); },[]);
  useEffect(()=>{setDrawerOpen(false);setResourcesOpen(false);},[location.pathname,location.hash]);
  useEffect(()=>{ if(!resourcesOpen)return; const onDown=(e:MouseEvent)=>{if(!menuRef.current?.contains(e.target as Node))setResourcesOpen(false)}; const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setResourcesOpen(false)}; document.addEventListener("mousedown",onDown);document.addEventListener("keydown",onKey);return()=>{document.removeEventListener("mousedown",onDown);document.removeEventListener("keydown",onKey)};},[resourcesOpen]);
  const closeDrawer=()=>{setDrawerOpen(false);requestAnimationFrame(()=>hamburgerRef.current?.focus())};
  return <div className="flex min-h-screen flex-col overflow-x-clip bg-bg-base"><SkipToContent targetId="main-content"/>
    <header className={`sticky top-0 z-40 border-b transition ${scrolled?"border-brand-dark/10 bg-[#F4F5F1]/92 shadow-e2 backdrop-blur-2xl":"border-transparent bg-bg-base/80 backdrop-blur-xl"}`}><div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-3 sm:px-8 lg:px-12"><Link to="/" aria-label={`${ASODEF_COMPANY.legalName}, inicio`}><BrandLogo className="h-10 w-auto"/></Link>
      <nav aria-label="Principal" className="ml-auto hidden items-center lg:flex"><ul className="flex items-center gap-1"><li><NavLink to="/" end className={({isActive})=>`rounded-full px-3 py-2 text-sm font-semibold ${isActive?"bg-brand-dark/8 text-brand-dark":"text-text-muted hover:text-brand-dark"}`}>Inicio</NavLink></li>{primary.map(item=><li key={item.path}><NavLink to={item.path} className={({isActive})=>`rounded-full px-3 py-2 text-sm font-semibold ${isActive?"bg-brand-dark/8 text-brand-dark":"text-text-muted hover:text-brand-dark"}`}>{item.label}</NavLink></li>)}<li ref={menuRef} className="relative"><button aria-expanded={resourcesOpen} aria-controls="resource-menu" onClick={()=>setResourcesOpen(v=>!v)} className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-text-muted hover:text-brand-dark">Recursos<ChevronDown className={`h-4 w-4 transition ${resourcesOpen?"rotate-180":""}`}/></button>{resourcesOpen&&<div id="resource-menu" className="absolute right-0 top-12 w-[34rem] rounded-3xl border border-brand-dark/10 bg-white p-4 shadow-e4"><div className="grid grid-cols-2 gap-2">{PUBLIC_NAV_GROUPS[2].items.map(item=><Link key={item.path} to={item.path} className="rounded-2xl p-4 hover:bg-bg-soft"><span className="font-semibold text-brand-dark">{item.label}</span><span className="mt-1 block text-xs leading-5 text-text-muted">{item.description}</span></Link>)}</div><div className="mt-2 grid grid-cols-3 gap-2 border-t border-brand-dark/10 pt-3">{[PUBLIC_ROUTES.payments,PUBLIC_ROUTES.pqr,PUBLIC_ROUTES.dsr].map(item=><Link key={item.path} to={item.path} className="rounded-xl px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-bg-soft">{item.label}</Link>)}</div></div>}</li></ul></nav>
      <div className="hidden items-center gap-2 lg:flex"><Link to="/iniciar-sesion" className="public-button-secondary !min-h-10 !px-4"><LogIn className="h-4 w-4"/>Ingresar</Link><Link to="/comenzar" className="public-button-primary !min-h-10 !px-4">Comenzar<ArrowRight className="h-4 w-4"/></Link></div>
      <IconButton ref={hamburgerRef} aria-label="Abrir menú de navegación" icon={<Menu className="h-5 w-5"/>} className="ml-auto lg:hidden" onClick={()=>setDrawerOpen(true)}/></div></header>
    <Drawer open={drawerOpen} onClose={closeDrawer} title="Navegación" side="right"><div className="mb-6 flex items-center justify-between"><BrandLogo className="h-9 w-auto"/><button onClick={closeDrawer} aria-label="Cerrar menú" className="rounded-full p-2 hover:bg-bg-soft"><X className="h-5 w-5"/></button></div><nav aria-label="Principal móvil" className="space-y-6">{PUBLIC_NAV_GROUPS.map(group=><section key={group.label}><p className="px-3 text-xs font-bold uppercase tracking-[.15em] text-text-muted">{group.label}</p><ul className="mt-2 space-y-1">{group.items.map(item=><li key={item.path}><Link to={item.path} className="block rounded-xl px-3 py-2.5 font-semibold text-text-main hover:bg-bg-soft">{item.label}<span className="mt-1 block text-xs font-normal leading-5 text-text-muted">{item.description}</span></Link></li>)}</ul></section>)}</nav><div className="mt-7 grid gap-2 border-t border-brand-dark/10 pt-5"><Link to="/iniciar-sesion" className="public-button-secondary">Ingresar</Link><Link to="/comenzar" className="public-button-primary">Comenzar</Link></div></Drawer>
    <main id="main-content" ref={mainRef} tabIndex={-1} className="w-full flex-1 focus:outline-none"><Outlet/></main>
    <footer className="bg-brand-deep text-white"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.2fr_2fr] lg:px-12"><div><BrandLogo variant="icon" className="h-14 w-auto"/><p className="mt-5 max-w-sm leading-7 text-white/65">ASODEF conecta beneficios, gestión y evidencia para personas y organizaciones.</p><p className="mt-5 text-sm text-white/55">{ASODEF_COMPANY.addressLine1} · {ASODEF_COMPANY.city}<br/>{ASODEF_COMPANY.corporateEmail}</p></div><div className="grid gap-8 sm:grid-cols-3">{PUBLIC_NAV_GROUPS.map(group=><nav key={group.label} aria-label={`Pie: ${group.label}`}><p className="text-xs font-bold uppercase tracking-wider text-white/45">{group.label}</p><ul className="mt-4 space-y-3">{group.items.slice(0,5).map(item=><li key={item.path}><Link className="text-sm text-white/75 hover:text-brand-orange-light" to={item.path}>{item.label}</Link></li>)}</ul></nav>)}</div></div><div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-xs text-white/50 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12"><p>© {new Date().getFullYear()} {ASODEF_COMPANY.legalName}</p><div className="flex flex-wrap gap-5"><button onClick={openPreferences} className="hover:text-white">Preferencias de cookies</button><Link to="/legal/politica-de-privacidad">Privacidad</Link><span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5"/>Canales institucionales</span></div></div></div></footer>
    <WhatsAppFloatingButton phoneNumber={WHATSAPP_NUMBER} tooltip="Escríbenos por WhatsApp" ariaLabel="Contactar por WhatsApp (se abre en una pestaña nueva)"/>
  </div>;
}
