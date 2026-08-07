import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CircleHelp,
  CreditCard,
  Database,
  Gift,
  MessageSquareText,
  Route,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Seo } from "../../lib/seo/Seo";
import { GeneralContactForm } from "../../components/transactional-public/GeneralContactForm";
import { PublicActionCard } from "../../components/public/PublicActionCard";

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
  { id: "affiliate", label: "Consultar mi afiliación", description: "Inicia con número de titular o documento y verifica tu identidad.", to: "/mi-cuenta/acceso", icon: UserRound },
  { id: "payment", label: "Consultar un pago", description: "Busca una obligación, revisa el estado o accede al comprobante.", to: "/pagos", icon: CreditCard },
  { id: "pqr", label: "Radicar una PQR", description: "Registra el caso y recibe un número para consultar su estado.", to: "/pqr?accion=radicar", icon: MessageSquareText },
  { id: "data", label: "Ejercer un derecho sobre mis datos", description: "Solicita acceso, corrección, actualización, eliminación u otra gestión permitida.", to: "/solicitudes-de-datos?accion=crear", icon: Database },
  { id: "company", label: "Acceso de empresas", description: "Inicia con el NIT registrado y completa la verificación requerida.", to: "/empresa/acceso", icon: Building2 },
  { id: "other", label: "Otro asunto", description: "Registra un mensaje cuando ninguna ruta anterior corresponde.", icon: CircleHelp },
];

export function ContactPage() {
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const generalFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showGeneralForm) generalFormRef.current?.focus({ preventScroll: true });
  }, [showGeneralForm]);

  return (
    <>
      <Seo routeKey="contact" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Contacto", path: "/contacto" }]} />
      <section className="bg-[radial-gradient(circle_at_85%_0%,rgba(128,174,58,.13),transparent_28rem)] py-7 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Contacto y orientación</p>
          <h1 className="mt-2 max-w-3xl font-display text-[2rem] font-semibold leading-tight tracking-[-.04em] text-text-main sm:mt-3 sm:text-5xl">¿Qué necesitas hacer?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted sm:mt-4 sm:text-base sm:leading-7">Elige una tarea y ve directamente al proceso que la gestiona.</p>

          <ul className="mt-5 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-3 lg:grid-cols-4" aria-label="Rutas de atención">
            {CONTACT_ROUTES.map((route) => (
              <li key={route.id} className="h-full">
                {route.to ? (
                  <PublicActionCard to={route.to} title={route.label} description={route.description} icon={route.icon} density="compact" />
                ) : (
                  <PublicActionCard onClick={() => setShowGeneralForm(true)} title={route.label} description={route.description} icon={route.icon} density="compact" selected={showGeneralForm} ariaPressed={showGeneralForm} ariaExpanded={showGeneralForm} ariaControls="otro-asunto" />
                )}
              </li>
            ))}
          </ul>

          <p className="mt-5 text-sm text-text-muted">
            ¿Eres parte del equipo autorizado? <Link className="font-semibold text-brand-dark underline decoration-brand-orange/50 underline-offset-4" to="/iniciar-sesion">Acceso administrativo</Link>
          </p>

          {showGeneralForm && (
            <div ref={generalFormRef} tabIndex={-1} className="mt-6 focus:outline-none sm:mt-10" id="otro-asunto">
              <GeneralContactForm />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
