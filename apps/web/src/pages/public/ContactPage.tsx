import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CircleHelp,
  CreditCard,
  Database,
  Gift,
  LogIn,
  MessageSquareText,
  Route,
  type LucideIcon,
} from "lucide-react";
import { Seo } from "../../lib/seo/Seo";
import { GeneralContactForm } from "../../components/transactional-public/GeneralContactForm";

interface ContactRoute {
  id: string;
  label: string;
  description: string;
  to?: string;
  icon: LucideIcon;
}

const CONTACT_ROUTES: readonly ContactRoute[] = [
  { id: "benefits", label: "Conocer beneficios", description: "Compara categorías, requisitos, proceso y canal de acceso.", to: "/beneficios", icon: Gift },
  { id: "orientation", label: "Solicitar orientación", description: "Responde unas preguntas para llegar al canal adecuado.", to: "/comenzar", icon: Route },
  { id: "payment", label: "Consultar un pago", description: "Busca una obligación, revisa el estado o accede al comprobante.", to: "/pagos", icon: CreditCard },
  { id: "pqr", label: "Radicar una PQR", description: "Registra el caso y recibe un número para consultar su estado.", to: "/pqr?accion=radicar", icon: MessageSquareText },
  { id: "data", label: "Ejercer un derecho sobre mis datos", description: "Solicita acceso, corrección, actualización, eliminación u otra gestión permitida.", to: "/solicitudes-de-datos?accion=crear", icon: Database },
  { id: "company", label: "Gestionar una empresa", description: "Describe la necesidad de tu organización para recibir orientación.", to: "/comenzar?perfil=empresa", icon: Building2 },
  { id: "portal", label: "Ingresar al portal", description: "Accede con tu cuenta a los servicios disponibles para tu perfil.", to: "/iniciar-sesion", icon: LogIn },
  { id: "other", label: "Otro asunto", description: "Registra un mensaje cuando ninguna ruta anterior corresponde.", icon: CircleHelp },
];

function RouteCard({ route, selected, onSelect }: { route: ContactRoute; selected: boolean; onSelect: () => void }) {
  const Icon = route.icon;
  const className = `group flex min-h-24 items-start gap-4 rounded-2xl border p-4 text-left transition-[border-color,background-color,transform] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 active:scale-[.99] ${
    selected ? "border-brand-dark bg-brand-dark text-white" : "border-brand-dark/12 bg-white hover:border-brand-dark/35 hover:bg-bg-soft"
  }`;
  const content = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-white/12" : "bg-brand-dark-50 text-brand-dark"}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{route.label}</span>
        <span className={`mt-1 block text-sm leading-5 ${selected ? "text-white/70" : "text-text-muted"}`}>{route.description}</span>
      </span>
      {route.to && <ArrowRight className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />}
    </>
  );

  return <li>{route.to ? <Link to={route.to} className={className}>{content}</Link> : <button type="button" aria-pressed={selected} aria-expanded={selected} aria-controls="otro-asunto" onClick={onSelect} className={className}>{content}</button>}</li>;
}

export function ContactPage() {
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const generalFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showGeneralForm) generalFormRef.current?.focus({ preventScroll: true });
  }, [showGeneralForm]);

  return (
    <>
      <Seo routeKey="contact" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Contacto", path: "/contacto" }]} />
      <section className="bg-[radial-gradient(circle_at_85%_0%,rgba(128,174,58,.13),transparent_28rem)] py-10 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Contacto y orientación</p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-[-.04em] text-text-main sm:text-5xl">¿Qué necesitas hacer?</h1>
          <p className="mt-4 max-w-2xl leading-7 text-text-muted">Elige una tarea para ir directamente al proceso que la gestiona.</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Rutas de atención">
            {CONTACT_ROUTES.map((route) => (
              <RouteCard key={route.id} route={route} selected={route.id === "other" && showGeneralForm} onSelect={() => setShowGeneralForm(true)} />
            ))}
          </ul>

          {showGeneralForm && (
            <div ref={generalFormRef} tabIndex={-1} className="mt-10 focus:outline-none" id="otro-asunto">
              <GeneralContactForm />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
