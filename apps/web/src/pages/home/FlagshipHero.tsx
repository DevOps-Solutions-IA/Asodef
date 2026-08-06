import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CreditCard,
  FileCheck2,
  HeartHandshake,
  LogIn,
  MessageSquareText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { ConnectionPulse } from "../../components/public/motion";

const ecosystemLinks = [
  { label: "Personas", to: "/soluciones/personas", icon: UserRound, position: "left-[1%] top-[6%]" },
  { label: "Afiliados", to: "/soluciones/afiliados", icon: UsersRound, position: "right-[1%] top-[6%]" },
  { label: "Empresas", to: "/empresas", icon: Building2, position: "left-[-1%] top-[43%]" },
  { label: "Beneficios", to: "/beneficios", icon: HeartHandshake, position: "right-[-1%] top-[43%]" },
  { label: "Pagos", to: "/pagos", icon: CreditCard, position: "left-[4%] bottom-[4%]" },
  { label: "Solicitudes", to: "/recursos", icon: FileCheck2, position: "right-[2%] bottom-[4%]" },
] as const;

const quickActions = [
  { label: "Pagar", to: "/pagos", icon: CreditCard, primary: true },
  { label: "Radicar PQR", to: "/pqr?accion=radicar", icon: MessageSquareText, primary: false },
  { label: "Consultar caso", to: "/pqr?accion=consultar", icon: MessageSquareText, primary: false },
  { label: "Solicitudes de datos", to: "/solicitudes-de-datos", icon: FileCheck2, primary: false },
  { label: "Ingresar", to: "/iniciar-sesion", icon: LogIn, primary: false },
] as const;

export function FlagshipHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-brand-dark/10 py-10 sm:py-16 lg:min-h-[720px] lg:py-24">
      <div aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(120deg,#f8faf6_0%,#eef4ed_46%,#f4f5f1_100%)]" />
      <div aria-hidden className="absolute -right-52 -top-60 -z-10 h-[45rem] w-[45rem] rounded-full border border-brand-dark/10 bg-brand-light/10 blur-[1px]" />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:px-12">
        <div className="relative z-10">
          <p className="hidden items-center gap-2 rounded-full border border-brand-dark/15 bg-white/75 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-brand-dark shadow-e1 sm:inline-flex">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            Personas · afiliados · empresas · aliados
          </p>
          <h1 className="max-w-4xl font-display text-[clamp(2.55rem,6.2vw,5.9rem)] font-semibold leading-[.94] tracking-[-.055em] text-text-main sm:mt-7">
            Beneficios, pagos y solicitudes en <span className="text-brand-orange">un solo lugar.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted sm:mt-8 sm:text-xl sm:leading-8">
            Elige una acción o entra a tu portal para continuar con el servicio de ASODEF que necesitas.
          </p>
          <div className="mt-7 grid gap-2 min-[390px]:grid-cols-2 sm:mt-9 sm:flex sm:flex-wrap sm:gap-3">
            <Link to="/comenzar" className="public-button-primary w-full sm:w-auto">
              Recibir orientación
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link to="/beneficios" className="public-button-secondary w-full sm:w-auto">Consultar beneficios</Link>
          </div>
          <div className="mt-8 hidden flex-wrap gap-x-7 gap-y-3 border-t border-brand-dark/10 pt-5 text-sm font-medium text-text-muted sm:flex sm:mt-10 sm:pt-6">
            <span>Pagos con Bold</span>
            <span>Casos con referencia</span>
            <span>Consentimientos versionados</span>
          </div>
        </div>

        <nav className="relative mx-auto hidden aspect-square w-full max-w-[36rem] sm:block" aria-label="Accesos directos ASODEF">
          <div className="absolute inset-[16%] rounded-full border border-brand-dark/15 bg-white/70 shadow-e4 backdrop-blur-xl">
            <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-brand-deep text-center text-white shadow-e3">
              <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-orange-light">ASODEF</span>
              <span className="mt-2 font-display text-2xl font-semibold">Servicios conectados</span>
              <span className="mt-2 max-w-40 text-xs leading-5 text-white/65">Elige un acceso para continuar</span>
              <ConnectionPulse className="mt-4" />
            </div>
            <div aria-hidden className="absolute inset-[8%] animate-[spin_36s_linear_infinite] rounded-full border border-dashed border-brand-dark/20 motion-reduce:animate-none" />
          </div>
          {ecosystemLinks.map(({ label, to, icon: Icon, position }) => (
            <Link
              key={label}
              to={to}
              className={`absolute ${position} flex min-w-32 items-center gap-3 rounded-2xl border border-white bg-white/90 p-4 shadow-e3 backdrop-blur transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30 motion-reduce:transform-none`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-dark/10">
                <Icon aria-hidden className="h-5 w-5 text-brand-dark" />
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <nav className="mx-auto mt-7 max-w-7xl px-5 sm:hidden" aria-label="Acciones rápidas">
        <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {quickActions.map(({ label, to, icon: Icon, primary }) => <li key={label} className="snap-start"><Link to={to} className={`flex min-h-12 min-w-max items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-e1 transition active:scale-[.98] motion-reduce:transform-none motion-reduce:transition-none ${primary ? "border-brand-dark bg-brand-dark text-white" : "border-brand-dark/15 bg-white text-brand-dark"}`}><Icon aria-hidden className={`h-4 w-4 ${primary ? "text-brand-orange-light" : "text-brand-orange"}`} />{label}</Link></li>)}
        </ul>
      </nav>
    </section>
  );
}
