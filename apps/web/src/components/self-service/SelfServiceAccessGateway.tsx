import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, CheckCircle2, Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import { Alert, Button, Card, Input, Label, Select, cn } from "@asodef/ui";
import type { SelfServiceChannelKind, SelfServiceSessionController } from "../../lib/self-service";

function ChannelIcon({ kind }: { kind: SelfServiceChannelKind }) {
  return kind === "email" ? <Mail aria-hidden="true" className="h-5 w-5" /> : <MessageSquareText aria-hidden="true" className="h-5 w-5" />;
}

export function SelfServiceAccessGateway<LookupInput>({ scope, controller, makeInput }: {
  scope: "affiliate" | "company";
  controller: SelfServiceSessionController<LookupInput>;
  makeInput: (identifier: string, options: { identifierMode: "TITULAR_NUMBER" | "DOCUMENT"; documentType?: string }) => LookupInput;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const codeRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [identifierMode, setIdentifierMode] = useState<"TITULAR_NUMBER" | "DOCUMENT">("TITULAR_NUMBER");
  const [documentType, setDocumentType] = useState("CC");
  const [selectedChannel, setSelectedChannel] = useState<string>();
  const [code, setCode] = useState("");
  const state = controller.state;
  const destination = (location.state as { from?: string } | null)?.from;
  const home = scope === "affiliate" ? "/mi-cuenta" : "/empresa";
  const title = scope === "affiliate" ? "Acceso de afiliados" : "Acceso de empresas";

  useEffect(() => { if (state.status === "challenge_required" && state.codeSent) codeRef.current?.focus(); }, [state.codeSent, state.status]);
  useEffect(() => { if (state.status === "verified") navigate(destination?.startsWith(home) ? destination : home, { replace: true }); }, [destination, home, navigate, state.status]);

  async function start(event: FormEvent) {
    event.preventDefault();
    await controller.startLookup(makeInput(identifier.trim(), { identifierMode, documentType: identifierMode === "DOCUMENT" ? documentType : undefined }));
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (await controller.verifyCode(code)) navigate(destination?.startsWith(home) ? destination : home, { replace: true });
  }

  const availableChannels = state.channels?.filter((channel) => channel.enabled && channel.available) ?? [];
  const chosen = state.channels?.find((channel) => channel.id === state.selectedChannelId);

  return (
    <section className="mx-auto max-w-lg" aria-labelledby={`${scope}-access-title`}>
        <Card className="p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-dark text-white">{scope === "affiliate" ? <ShieldCheck /> : <Building2 />}</div>
          <h1 id={`${scope}-access-title`} className="mt-5 font-display text-3xl font-semibold tracking-tight text-brand-dark">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">Verifica tu identidad con un contacto registrado. No necesitas contraseña.</p>

          {(state.status === "provider_unavailable" || state.status === "locked" || state.status === "expired") && (
            <Alert className="mt-5" variant={state.status === "locked" ? "danger" : "warning"} title={state.status === "locked" ? "Acceso bloqueado temporalmente" : "No fue posible continuar"}>{state.message ?? "Intenta nuevamente más tarde."}</Alert>
          )}

          {state.status !== "challenge_required" ? (
            <form className="mt-7 space-y-5" onSubmit={start}>
              {scope === "affiliate" && <div><Label htmlFor="affiliate-identifier-mode">Identificarme con</Label><Select id="affiliate-identifier-mode" value={identifierMode} onChange={(event) => setIdentifierMode(event.target.value as "TITULAR_NUMBER" | "DOCUMENT")} className="mt-2"><option value="TITULAR_NUMBER">Número de titular</option><option value="DOCUMENT">Documento</option></Select></div>}
              {scope === "affiliate" && identifierMode === "DOCUMENT" && <div><Label htmlFor="affiliate-document-type">Tipo de documento</Label><Select id="affiliate-document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="mt-2"><option value="CC">Cédula de ciudadanía</option><option value="CE">Cédula de extranjería</option><option value="TI">Tarjeta de identidad</option><option value="PA">Pasaporte</option><option value="PPT">Permiso por protección temporal</option></Select></div>}
              <div><Label htmlFor={`${scope}-identifier`}>{scope === "affiliate" ? identifierMode === "DOCUMENT" ? "Número de documento" : "Número de titular" : "NIT de la empresa"}</Label><Input id={`${scope}-identifier`} autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} minLength={4} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9 .-]*" required className="mt-2" /></div>
              <Button type="submit" size="lg" className="w-full" loading={state.status === "lookup_pending"}>Consultar opciones de verificación</Button>
            </form>
          ) : !state.codeSent ? (
            <section className="mt-7" aria-labelledby={`${scope}-channels`}>
              <h2 id={`${scope}-channels`} className="font-display text-xl font-semibold text-brand-dark">Elige un canal registrado</h2>
              <p className="mt-1 text-sm text-text-muted">Por seguridad, solo mostramos destinos enmascarados entregados por el proveedor.</p>
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
          <p className="mt-6 border-t border-brand-dark/10 pt-5 text-xs leading-5 text-text-muted">ASODEF nunca permite elegir un destino diferente a los contactos enmascarados autorizados por el proveedor.</p>
        </Card>
    </section>
  );
}
