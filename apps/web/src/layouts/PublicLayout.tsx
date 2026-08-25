import { useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ASODEF_COMPANY } from "@asodef/config";
import { ShieldCheck } from "lucide-react";
import { PUBLIC_NAV_GROUPS } from "../lib/public-content/public-routes";
import { useCookieConsent } from "../lib/cookie-consent/cookie-consent-context";
import { BrandLogo } from "./shared/BrandLogo";
import { SkipToContent } from "./shared/SkipToContent";
import { useFocusMainOnRouteChange } from "./shared/useFocusMainOnRouteChange";
import { useScrollToHash } from "./shared/useScrollToHash";
import { WhatsAppFloatingButton } from "./shared/WhatsAppFloatingButton";
import { RouteTransition } from "../components/public/motion";
import { PublicHeader } from "./shared/PublicHeader";
import { KoralWebChatWidget } from "../components/koral-web-chat";

const WHATSAPP_NUMBER = "573232733927";
export function PublicLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { openPreferences } = useCookieConsent();
  useFocusMainOnRouteChange(mainRef, { preventScroll: true }); useScrollToHash();
  return <div className="flex min-h-screen flex-col overflow-x-clip bg-bg-base"><SkipToContent targetId="main-content"/>
    <PublicHeader />
    <main id="main-content" ref={mainRef} tabIndex={-1} className="w-full flex-1 focus:outline-none"><RouteTransition routeKey={location.pathname}><Outlet/></RouteTransition></main>
    <footer className="bg-brand-deep text-white"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.2fr_2fr] lg:px-12"><div><BrandLogo variant="icon" className="h-14 w-auto"/><p className="mt-5 max-w-sm leading-7 text-white/65">Consulta beneficios, paga o radica solicitudes en línea.</p><p className="mt-5 text-sm text-white/55">{ASODEF_COMPANY.addressLine1} · {ASODEF_COMPANY.city}<br/>{ASODEF_COMPANY.corporateEmail}</p></div><div className="grid gap-8 sm:grid-cols-3">{PUBLIC_NAV_GROUPS.map(group=><nav key={group.label} aria-label={`Pie: ${group.label}`}><p className="text-xs font-bold uppercase tracking-wider text-white/45">{group.label}</p><ul className="mt-4 space-y-3">{group.items.slice(0,5).map(item=><li key={item.path}><Link className="text-sm text-white/75 hover:text-brand-orange-light" to={item.path}>{item.label}</Link></li>)}</ul></nav>)}</div></div><div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-xs text-white/50 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12"><p>© {new Date().getFullYear()} {ASODEF_COMPANY.legalName}</p><div className="flex flex-wrap gap-5"><button onClick={openPreferences} className="hover:text-white">Preferencias de cookies</button><Link to="/legal/politica-de-privacidad">Privacidad</Link><Link to="/contacto" className="inline-flex items-center gap-1 hover:text-white"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5"/>Contacto y atención</Link></div></div></div></footer>
    <WhatsAppFloatingButton phoneNumber={WHATSAPP_NUMBER} tooltip="Escríbenos por WhatsApp" ariaLabel="Contactar por WhatsApp (se abre en una pestaña nueva)"/>
    <KoralWebChatWidget />
  </div>;
}
