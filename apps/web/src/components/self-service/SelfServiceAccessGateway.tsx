import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, CheckCircle2, Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import { Alert, Button, Card, Input, Label, cn } from "@asodef/ui";
import type { SelfServiceChannelKind, SelfServiceSessionController } from "../../lib/self-service";

function ChannelIcon({ kind }: { kind: SelfServiceChannelKind }) {
  return kind === "email" ? <Mail aria-hidden="true" className="h-5 w-5" /> : <MessageSquareText aria-hidden="true" className="h-5 w-5" />;
}

export function SelfServiceAccessGateway<LookupInput>({ scope, controller, makeInput }: {
  scope: "affiliate" | "company";
  controller: SelfServiceSessionController<LookupInput>;
  makeInput: (identifier: string) => LookupInput;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const codeRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>();
  const [code, setCode] = useState("");
  const state = controller.state;
  const destination = (location.state as { from?: string } | null)?.from;
  const home = scope === "affiliate" ? "/mi-cuenta" : "/empresa";
  const title = scope === "affiliate" ? "Acceso de afiliados" : "Acceso de empresas";
  const description = scope === "affiliate"
    ? "Ingresa el número de documento del titular para validar tu acceso de forma segura."
    : "Ingresa el NIT registrado para validar el acceso de la empresa de forma segura.";
  const identifierLabel = scope === "affiliate" ? "Número de documento del titular" : "NIT de la empresa";
  const identifierPlaceholder = scope === "affiliate" ? "Ingresa el número de documento" : "Ingresa el NIT";
  const accessNote = scope === "affiliate"
    ? "La validación continuará únicamente con los contactos autorizados registrados para el titular."
    : "La validación continuará únicamente con los contactos autorizados registrados para la empresa.";

  useEffect(() => { if (state.status === "challenge_required" && state.codeSent) codeRef.current?.focus(); }, [state.codeSent, state.status]);
  useEffect(() => { if (state.status === "verified") navigate(destination?.startsWith(home) ? destination : home, { replace: true }); }, [destination, home, navigate, state.status]);

  async function start(event: FormEvent) {
    event.preventDefault();
    await controller.startLookup(makeInput(identifier.trim()));
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (await controller.verifyCode(code)) navigate(destination?.startsWith(home) ? destination : home, { replace: true });
  }

  const availableChannels = state.channels?.filter((channel) => channel.enabled && channel.available) ?? [];
  const chosen = state.channels?.find((channel) => channel.id === state.selectedChannelId);

  return (
    <section className="mx-auto w-full max-w-5xl" aria-labelledby={`${scope}-access-title`}>
      <Card className="overflow-hidden !p-0 shadow-e4">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative overflow-hidden bg-brand-dark px-6 py-7 text-white sm:px-8 sm:py-9 lg:flex lg:min-h-[27rem] lg:flex-col lg:justify-between lg:p-10">
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-brand-green/25" aria-hidden="true" />
            <div className="absolute -bottom-20 -left-14 h-44 w-44 rounded-full bg-brand-orange/10" aria-hidden="true" />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-brand-orange-200 ring-1 ring-white/15">{scope === "affiliate" ? <ShieldCheck aria-hidden="true" className="h-6 w-6" /> : <Building2 aria-hidden="true" className="h-6 w-6" />}</div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-brand-orange-200">Acceso seguro</p>
              <h1 id={`${scope}-access-title`} className="mt-2 max-w-md font-display text-[clamp(1.9rem,5vw,2.75rem)] font-semibold leading-[1.06] tracking-tight">{title}</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/80 sm:text-base">{description}</p>
            </div>
            <p className="relative mt-6 hidden border-t border-white/10 pt-5 text-xs leading-5 text-white/65 lg:block">{accessNote}</p>
          </div>

          <div className="flex flex-col justify-center bg-white px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">

          {(state.status === "provider_unavailable" || state.status === "locked" || state.status === "expired") && (
            <Alert className="mb-5" variant={state.status === "locked" ? "danger" : "warning"} title={state.status === "locked" ? "Acceso bloqueado temporalmente" : "No fue posible continuar"}>{state.status === "provider_unavailable" ? "El servicio de verificación no está disponible en este momento. Intenta nuevamente más tarde." : state.message ?? "Intenta nuevamente más tarde."}</Alert>
          )}

          {state.status !== "challenge_required" ? (
            <form className="space-y-5" onSubmit={start}>
              <div>
                <Label htmlFor={`${scope}-identifier`}>{identifierLabel}</Label>
                <Input id={`${scope}-identifier`} autoComplete="username" inputMode="numeric" placeholder={identifierPlaceholder} value={identifier} onChange={(event) => setIdentifier(event.target.value)} minLength={scope === "affiliate" ? 4 : 5} maxLength={scope === "affiliate" ? 40 : 30} pattern={scope === "affiliate" ? "[0-9][0-9 .\\-]*" : "[0-9.\\-]+"} required className="mt-2 min-h-12" />
              </div>
              <Button type="submit" size="lg" className="min-h-12 w-full sm:w-auto sm:min-w-40" loading={state.status === "lookup_pending"}>Verificar</Button>
            </form>
          ) : !state.codeSent ? (
            <section aria-labelledby={`${scope}-channels`}>
              <h2 id={`${scope}-channels`} className="font-display text-xl font-semibold text-brand-dark">Elige un canal registrado</h2>
              <p className="mt-1 text-sm text-text-muted">Por seguridad, solo se muestran los contactos autorizados para este acceso.</p>
              {availableChannels.length === 0 ? <Alert className="mt-5" variant="warning">No hay canales disponibles para este registro.</Alert> : <div className="mt-5 grid gap-3">{availableChannels.map((channel) => (
                <button key={channel.id} type="button" onClick={() => setSelectedChannel(channel.id)} className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange", selectedChannel === channel.id ? "border-brand-dark bg-brand-dark-50" : "border-brand-dark/10 hover:border-brand-dark/30")} aria-pressed={selectedChannel === channel.id}>
                  <ChannelIcon kind={channel.kind} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-brand-dark">{channel.kind === "email" ? "Correo electrónico" : channel.kind === "whatsapp" ? "WhatsApp" : "Mensaje de texto"}</span><span className="block truncate text-xs text-text-muted">{channel.maskedDestination}</span></span>
                </button>
              ))}</div>}
              <Button className="mt-5 w-full" size="lg" disabled={!selectedChannel} onClick={() => selectedChannel && void controller.requestCode(selectedChannel)}>Enviar código</Button>
              <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => controller.reset()}>Usar otro identificador</Button>
            </section>
          ) : (
            <form className="mt-7 space-y-5" onSubmit={verify}>
              <Alert variant="success" title="Código enviado"><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{chosen?.maskedDestination ?? "Contacto registrado"}</span></Alert>
              {state.message && <Alert variant="warning">{state.message}</Alert>}
              <div><Label htmlFor={`${scope}-otp`}>Código de seis dígitos</Label><Input ref={codeRef} id={`${scope}-otp`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required className="mt-2 text-center text-xl tracking-[0.35em]" /></div>
              <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6}>Verificar y entrar</Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => void controller.resendCode()}>Reenviar código</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { controller.reset(); setCode(""); }}>Usar otro identificador</Button>
            </form>
          )}
          <p className="mt-6 border-t border-brand-dark/10 pt-5 text-xs leading-5 text-text-muted lg:hidden">{accessNote}</p>
        </div>
      </div>
      </Card>
    </section>
  );
}
