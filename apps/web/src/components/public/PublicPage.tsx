import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

export function PublicHero({ eyebrow, title, description, actions, aside }: { eyebrow: string; title: ReactNode; description: string; actions?: { label: string; to: string; primary?: boolean }[]; aside?: ReactNode }) {
  return <section className="public-hero relative overflow-hidden border-b border-brand-dark/10 py-16 sm:py-20 lg:py-24">
    <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_10%,rgba(128,174,58,.15),transparent_28rem),linear-gradient(135deg,rgba(255,255,255,.82),rgba(237,243,236,.72))]" />
    <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:px-12">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-dark">{eyebrow}</p><h1 className="mt-5 max-w-4xl font-display text-[clamp(2.6rem,6vw,5.4rem)] font-semibold leading-[.98] tracking-[-.05em] text-text-main">{title}</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-text-muted">{description}</p>
      {actions && <div className="mt-9 flex flex-wrap gap-3">{actions.map(action => <Link key={action.to} to={action.to} className={action.primary ? "public-button-primary" : "public-button-secondary"}>{action.label}<ArrowRight aria-hidden className="h-4 w-4" /></Link>)}</div>}</div>
      {aside ?? <div className="surface-panel relative rounded-[2rem] p-8"><ShieldCheck aria-hidden className="h-8 w-8 text-brand-orange" /><p className="mt-8 font-display text-2xl font-semibold text-brand-dark">Información para decidir con claridad</p><p className="mt-3 leading-7 text-text-muted">Contenido verificable, condiciones limitadas a cada relación y acceso directo a los canales institucionales.</p></div>}
    </div>
  </section>;
}

export function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">{eyebrow}</p><h2 className="mt-4 font-display text-3xl font-semibold tracking-[-.035em] text-text-main sm:text-5xl">{title}</h2><p className="mt-5 text-lg leading-8 text-text-muted">{description}</p></div>;
}

export function EditorialSection({ children, tone = "base", id }: { children: ReactNode; tone?: "base" | "soft" | "dark"; id?: string }) {
  return <section id={id} className={tone === "dark" ? "bg-brand-deep py-20 text-white sm:py-24" : tone === "soft" ? "border-y border-brand-dark/10 bg-bg-soft/70 py-20 sm:py-24" : "py-20 sm:py-24"}><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">{children}</div></section>;
}

export function OutcomeList({ items }: { items: readonly string[] }) { return <ul className="space-y-3">{items.map(item => <li key={item} className="flex gap-3 leading-7 text-text-muted"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-dark/10 text-brand-dark"><Check aria-hidden className="h-3 w-3" /></span>{item}</li>)}</ul>; }

export function NumberedProcess({ items }: { items: readonly string[] }) { return <ol className="grid gap-4 md:grid-cols-3">{items.map((item, i) => <li key={item} className="surface-panel rounded-2xl p-6"><span className="font-display text-3xl font-semibold text-brand-orange">{String(i + 1).padStart(2, "0")}</span><p className="mt-5 leading-7 text-text-muted">{item}</p></li>)}</ol>; }

export function FaqList({ items }: { items: readonly { question: string; answer: string }[] }) { return <div className="divide-y divide-brand-dark/10 border-y border-brand-dark/10">{items.map(item => <details key={item.question} className="group py-5"><summary className="cursor-pointer list-none pr-8 font-semibold text-text-main marker:hidden">{item.question}</summary><p className="mt-3 max-w-3xl leading-7 text-text-muted">{item.answer}</p></details>)}</div>; }

export function PageCta({ title, description, to = "/comenzar", label = "Encontrar mi ruta" }: { title: string; description: string; to?: string; label?: string }) { return <EditorialSection tone="dark"><div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-brand-orange-light">Siguiente paso</p><h2 className="mt-4 max-w-3xl font-display text-3xl font-semibold tracking-[-.035em] sm:text-5xl">{title}</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">{description}</p></div><Link className="public-button-light" to={to}>{label}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div></EditorialSection>; }
