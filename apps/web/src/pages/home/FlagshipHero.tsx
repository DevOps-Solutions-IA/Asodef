import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CreditCard,
  FileCheck2,
  HeartHandshake,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { SafeReveal, StaggeredItems } from "../../components/public/motion";

const serviceSignals = [
  { label: "Afiliados", icon: UsersRound },
  { label: "Empresas", icon: Building2 },
  { label: "Pagos", icon: CreditCard },
  { label: "Solicitudes", icon: FileCheck2 },
] as const;

const mobileActions = [
  { label: "Pagar", to: "/pagos", icon: CreditCard, primary: true },
  { label: "Mi cuenta", to: "/mi-cuenta/acceso", icon: UserRound, primary: false },
] as const;

export function FlagshipHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-brand-dark/10 py-10 sm:py-16 lg:min-h-[680px] lg:py-24">
      <div aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(120deg,#f8faf6_0%,#eef4ed_50%,#f6f5f0_100%)]" />
      <div aria-hidden className="absolute -right-56 -top-72 -z-10 h-[46rem] w-[46rem] rounded-full bg-brand-light/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-64 left-[38%] -z-10 h-[34rem] w-[34rem] rounded-full bg-brand-orange/5 blur-3xl" />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:px-12">
        <SafeReveal className="relative z-10">
          <p className="hidden items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-brand-dark sm:inline-flex">
            <ShieldCheck aria-hidden className="h-4 w-4 text-brand-orange" />
            ASODEF S.A.S. · Servicios y acompañamiento
          </p>
          <h1 className="max-w-4xl font-display text-[clamp(2.5rem,5.6vw,5.35rem)] font-semibold leading-[.96] tracking-[-.052em] text-text-main sm:mt-7">
            Bienestar, respaldo y atención <span className="text-brand-orange">en un mismo lugar.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted sm:mt-7 sm:text-lg sm:leading-8 lg:text-xl">
            Consulta beneficios, realiza pagos y gestiona solicitudes desde una plataforma clara y segura.
          </p>
          <div className="mt-8 hidden flex-wrap gap-3 sm:flex">
            <Link to="/mi-cuenta/acceso" className="public-button-primary">
              Mi cuenta
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link to="/beneficios" className="public-button-secondary">Conocer beneficios</Link>
          </div>
          <div className="mt-9 hidden flex-wrap gap-x-7 gap-y-3 border-t border-brand-dark/10 pt-5 text-sm font-medium text-text-muted sm:flex">
            <span>Acceso según tu perfil</span>
            <span>Seguimiento con referencia</span>
            <span>Gestión protegida</span>
          </div>
        </SafeReveal>

        <SafeReveal className="relative hidden sm:block" delay={0.08}>
          <div className="relative overflow-hidden rounded-[2.25rem] border border-white/90 bg-white/78 p-7 shadow-e4 backdrop-blur-xl lg:p-9">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-dark via-brand-green to-brand-orange" />
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.17em] text-brand-dark">Atención organizada</p>
                <h2 className="mt-3 max-w-sm font-display text-3xl font-semibold leading-tight tracking-[-.035em] text-text-main lg:text-4xl">
                  Cada gestión tiene un acceso claro.
                </h2>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-dark text-white shadow-e2">
                <HeartHandshake aria-hidden className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-5 max-w-md text-sm leading-6 text-text-muted lg:text-base lg:leading-7">
              Personas y organizaciones encuentran el canal que corresponde sin exponer información privada.
            </p>
            <StaggeredItems className="mt-8 grid grid-cols-2 gap-3">
              {serviceSignals.map(({ label, icon: Icon }) => (
                <div key={label} className="flex min-h-20 items-center gap-3 rounded-2xl border border-brand-dark/10 bg-bg-soft/75 p-4 transition duration-200 hover:border-brand-dark/20 hover:bg-white hover:shadow-e1 motion-reduce:transition-none">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-dark shadow-e1">
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-text-main">{label}</span>
                </div>
              ))}
            </StaggeredItems>
            <div className="mt-7 flex items-center gap-3 border-t border-brand-dark/10 pt-5 text-xs font-semibold uppercase tracking-[.13em] text-text-muted">
              <ShieldCheck aria-hidden className="h-4 w-4 text-brand-orange" />
              Accesos públicos y portales protegidos
            </div>
          </div>
        </SafeReveal>
      </div>

      <nav className="mx-auto mt-7 max-w-7xl px-5 sm:hidden" aria-label="Acciones rápidas">
        <ul className="grid gap-3">
          {mobileActions.map(({ label, to, icon: Icon, primary }) => (
            <li key={label}>
              <Link
                to={to}
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 text-center text-sm font-semibold shadow-e1 transition duration-200 active:scale-[.98] focus-visible:ring-4 focus-visible:ring-brand-orange/25 motion-reduce:transform-none motion-reduce:transition-none ${primary ? "border-brand-dark bg-brand-dark text-white hover:bg-brand-deep" : "border-brand-dark/20 bg-white text-brand-dark hover:border-brand-dark/35"}`}
              >
                <Icon aria-hidden className={`h-4 w-4 shrink-0 ${primary ? "text-brand-orange-light" : "text-brand-orange"}`} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
