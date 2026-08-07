import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Input, Label, Select } from "@asodef/ui";
import { selfServiceApi, useAffiliateSelfService, type ProviderPayload, type ResourceResult, type SelfServiceChannelKind } from "../../lib/self-service";

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `contact_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function stringField(data: ProviderPayload | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === "string" ? value : undefined;
}

function ResultAlert({ result }: { result?: ResourceResult<ProviderPayload> }) {
  if (!result || result.status === "success" || result.status === "partial") return null;
  return <Alert variant="warning">{result.message ?? "El servicio externo no está disponible para completar este cambio."}</Alert>;
}

/** Step-up flow: the existing OTP session proves the current registered
 * channel; ASODEF then verifies the new destination before asking the core
 * provider to apply the change. */
export function ContactUpdatePanel() {
  const { state } = useAffiliateSelfService();
  const [channel, setChannel] = useState<SelfServiceChannelKind>("email");
  const [destination, setDestination] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [maskedDestination, setMaskedDestination] = useState<string>();
  const [code, setCode] = useState("");
  const [confirmedStatus, setConfirmedStatus] = useState<string>();

  const start = useMutation({
    mutationFn: async () => {
      const csrf = state.csrfToken!;
      const created = await selfServiceApi.startContactUpdate(channel, destination, csrf, idempotencyKey());
      if (created.status !== "success") return created;
      const id = stringField(created.data, "requestId");
      if (!id) return { status: "unavailable", message: "El proveedor no devolvió una referencia válida." } as const;
      setRequestId(id);
      setMaskedDestination(stringField(created.data, "maskedDestination"));
      return selfServiceApi.requestContactUpdateCode(id, csrf, idempotencyKey());
    },
  });

  const verify = useMutation({
    mutationFn: () => selfServiceApi.verifyContactUpdate(requestId!, code, state.csrfToken!, idempotencyKey()),
    onSuccess: (result) => {
      if (result.status === "success" || result.status === "partial") setConfirmedStatus(stringField(result.data, "status"));
    },
  });

  const status = useMutation({
    mutationFn: () => selfServiceApi.getContactUpdateStatus(requestId!),
    onSuccess: (result) => {
      if (result.status === "success" || result.status === "partial") setConfirmedStatus(stringField(result.data, "status"));
    },
  });

  function submitStart(event: FormEvent) {
    event.preventDefault();
    if (state.status === "verified" && state.csrfToken) start.mutate();
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (requestId && code.length === 6 && state.csrfToken) verify.mutate();
  }

  return (
    <Card className="space-y-5" aria-labelledby="contact-update-title">
      <div>
        <h2 id="contact-update-title" className="font-display text-xl font-semibold text-brand-dark">Actualizar correo o teléfono</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">Primero verificamos tu canal registrado. Después enviamos otro código al nuevo destino y el cambio solo queda aplicado cuando lo confirma el proveedor.</p>
      </div>

      {!requestId ? (
        <form className="grid gap-4 sm:grid-cols-[11rem_1fr_auto] sm:items-end" onSubmit={submitStart}>
          <div><Label htmlFor="contact-update-channel">Dato a actualizar</Label><Select id="contact-update-channel" className="mt-2" value={channel} onChange={(event) => setChannel(event.target.value as SelfServiceChannelKind)}><option value="email">Correo electrónico</option><option value="sms">Teléfono para SMS</option><option value="whatsapp">Teléfono para WhatsApp</option></Select></div>
          <div><Label htmlFor="contact-update-destination">Nuevo destino</Label><Input id="contact-update-destination" className="mt-2" type={channel === "email" ? "email" : "tel"} inputMode={channel === "email" ? "email" : "tel"} placeholder={channel === "email" ? "nombre@dominio.com" : "+573001234567"} value={destination} onChange={(event) => setDestination(event.target.value)} required /></div>
          <Button type="submit" loading={start.isPending} disabled={state.status !== "verified" || !state.csrfToken}>Verificar nuevo dato</Button>
        </form>
      ) : !confirmedStatus ? (
        <form className="space-y-4" onSubmit={submitCode}>
          <Alert variant="info" title="Código enviado">Ingresa el código de seis dígitos enviado a {maskedDestination ?? "tu nuevo destino"}.</Alert>
          <div className="max-w-xs"><Label htmlFor="contact-update-code">Código de verificación</Label><Input id="contact-update-code" className="mt-2 text-center tracking-[.3em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></div>
          <div className="flex flex-wrap gap-3"><Button type="submit" loading={verify.isPending} disabled={code.length !== 6}>Confirmar nuevo dato</Button><Button type="button" variant="ghost" onClick={() => { setRequestId(undefined); setCode(""); start.reset(); verify.reset(); }}>Cancelar</Button></div>
        </form>
      ) : (
        <div className="space-y-4">
          <Alert variant={confirmedStatus === "APPLIED" ? "success" : confirmedStatus === "REJECTED" ? "danger" : "info"} title={confirmedStatus === "APPLIED" ? "Cambio aplicado" : "Cambio en proceso"}>{confirmedStatus === "APPLIED" ? "El proveedor confirmó la actualización." : confirmedStatus === "REJECTED" ? "El proveedor rechazó la actualización. Conservamos el dato anterior." : "El nuevo destino fue verificado. La actualización permanece pendiente de confirmación del proveedor."}</Alert>
          <Button type="button" variant="secondary" loading={status.isPending} onClick={() => status.mutate()}>Consultar estado</Button>
        </div>
      )}

      <ResultAlert result={start.data} />
      <ResultAlert result={verify.data} />
      <ResultAlert result={status.data} />
      {(start.isError || verify.isError || status.isError) && <Alert variant="danger">No fue posible completar la operación. Ningún dato fue marcado como actualizado.</Alert>}
    </Card>
  );
}
