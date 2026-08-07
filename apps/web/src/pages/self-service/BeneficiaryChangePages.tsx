import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Input, Label, PageHeader, Select, Textarea } from "@asodef/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProviderDataView, SelfServiceStatePanel } from "../../components/self-service";
import { selfServiceApi, useAffiliateSelfService, type BeneficiaryDraftInput, type BeneficiaryOperation, type ProviderPayload } from "../../lib/self-service";

function idempotencyKey() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `beneficiary_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function stringField(payload: ProviderPayload, ...keys: string[]) { for (const key of keys) if (typeof payload[key] === "string") return payload[key] as string; return undefined; }
function operationField(payload: ProviderPayload): BeneficiaryOperation | undefined { const value = payload.operation; return value === "ADD" || value === "UPDATE" || value === "REMOVE" ? value : undefined; }
function operationsFromRules(payload: ProviderPayload): readonly BeneficiaryOperation[] {
  const value = payload.allowedOperations;
  return Array.isArray(value) ? value.filter((item): item is BeneficiaryOperation => item === "ADD" || item === "UPDATE" || item === "REMOVE") : [];
}
function requirementsFromRules(payload: ProviderPayload): readonly string[] {
  const value = payload.requiredDocumentLabels ?? payload.requiredDocuments;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function DraftFields({ operation, setOperation, beneficiaryId, setBeneficiaryId, displayName, setDisplayName, relationship, setRelationship, reason, setReason, operations }: {
  operation: BeneficiaryOperation; setOperation: (value: BeneficiaryOperation) => void; beneficiaryId: string; setBeneficiaryId: (value: string) => void;
  displayName: string; setDisplayName: (value: string) => void; relationship: string; setRelationship: (value: string) => void; reason: string; setReason: (value: string) => void; operations: readonly BeneficiaryOperation[];
}) {
  return <div className="grid gap-5 sm:grid-cols-2">
    <div><Label htmlFor="operation">Tipo de cambio</Label><Select id="operation" value={operation} onChange={(event) => setOperation(event.target.value as BeneficiaryOperation)} className="mt-2">{operations.map((item) => <option key={item} value={item}>{item === "ADD" ? "Agregar beneficiario" : item === "UPDATE" ? "Actualizar beneficiario" : "Retirar beneficiario"}</option>)}</Select></div>
    {operation !== "ADD" && <div><Label htmlFor="beneficiary-id">Referencia del beneficiario</Label><Input id="beneficiary-id" value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} required className="mt-2" /></div>}
    {operation !== "REMOVE" && <><div><Label htmlFor="beneficiary-name">Nombre del beneficiario</Label><Input id="beneficiary-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required className="mt-2" /></div><div><Label htmlFor="relationship">Parentesco</Label><Input id="relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} required className="mt-2" /></div></>}
    <div className="sm:col-span-2"><Label htmlFor="reason">Motivo o información adicional</Label><Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} required className="mt-2" rows={4} /></div>
  </div>;
}

export function BeneficiaryChangeCreatePage() {
  const navigate = useNavigate();
  const { state } = useAffiliateSelfService();
  const rules = useQuery({ queryKey: ["self-service", "affiliate", "beneficiary-rules"], queryFn: ({ signal }) => selfServiceApi.getBeneficiaryRules(signal), retry: false });
  const operations = rules.data?.status === "success" || rules.data?.status === "partial" ? operationsFromRules(rules.data.data) : [];
  const requirements = rules.data?.status === "success" || rules.data?.status === "partial" ? requirementsFromRules(rules.data.data) : [];
  const [operation, setOperation] = useState<BeneficiaryOperation>("ADD");
  const [beneficiaryId, setBeneficiaryId] = useState(""); const [displayName, setDisplayName] = useState(""); const [relationship, setRelationship] = useState(""); const [reason, setReason] = useState("");
  const mutation = useMutation({ mutationFn: (input: BeneficiaryDraftInput) => selfServiceApi.createBeneficiaryDraft(input, state.csrfToken!, idempotencyKey()), onSuccess: (result) => { if (result.status === "success") { const id = stringField(result.data, "id", "requestId"); if (id) navigate(`/mi-cuenta/beneficiarios/solicitudes/${encodeURIComponent(id)}`); } } });
  const selectedOperation = operations.includes(operation) ? operation : operations[0];
  function submit(event: FormEvent) { event.preventDefault(); if (!selectedOperation || !state.csrfToken) return; mutation.mutate({ operation: selectedOperation, beneficiaryId: beneficiaryId || undefined, beneficiaryDisplayName: displayName || undefined, relationship: relationship || undefined, reason }); }
  if (rules.isPending) return <SelfServiceStatePanel status="loading" />;
  if (rules.isError) return <SelfServiceStatePanel status="unavailable" onRetry={() => void rules.refetch()} />;
  if (rules.data.status !== "success" && rules.data.status !== "partial") return <SelfServiceStatePanel status={rules.data.status} message={rules.data.message} />;
  if (operations.length === 0) return <SelfServiceStatePanel status="not_configured" message="El proveedor no ha definido operaciones de beneficiarios disponibles." />;
  if (!state.csrfToken) return <SelfServiceStatePanel status="expired" message="Para crear o modificar una solicitud debes volver a verificar tu identidad." />;
  return <div className="space-y-6"><PageHeader title="Nueva solicitud de beneficiario" description="Crea un borrador y adjunta únicamente los documentos que solicite el proveedor." eyebrow="Mi cuenta · Beneficiarios" />{requirements.length > 0 && <Card variant="subtle"><h2 className="font-display text-lg font-semibold">Requisitos informados por el proveedor</h2><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted">{requirements.map((item) => <li key={item}>{item}</li>)}</ul></Card>}<Card><form onSubmit={submit} className="space-y-6"><DraftFields operation={selectedOperation!} setOperation={setOperation} beneficiaryId={beneficiaryId} setBeneficiaryId={setBeneficiaryId} displayName={displayName} setDisplayName={setDisplayName} relationship={relationship} setRelationship={setRelationship} reason={reason} setReason={setReason} operations={operations} />{mutation.isError && <Alert variant="danger">No fue posible crear el borrador.</Alert>}{mutation.data && mutation.data.status !== "success" && <Alert variant="warning">{mutation.data.message ?? "El proveedor no pudo crear el borrador."}</Alert>}<div className="flex flex-wrap gap-3"><Button type="submit" loading={mutation.isPending}>Guardar borrador</Button><Link to="/mi-cuenta/beneficiarios" className="inline-flex h-11 items-center rounded-full border border-brand-dark/10 px-5 text-sm font-medium">Cancelar</Link></div></form></Card></div>;
}

export function BeneficiaryChangeDetailPage() {
  const { requestId = "" } = useParams(); const { state } = useAffiliateSelfService(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["self-service", "affiliate", "beneficiary-change", requestId], queryFn: ({ signal }) => selfServiceApi.getBeneficiaryChangeRequest(requestId, signal), enabled: Boolean(requestId), retry: false });
  const [documentType, setDocumentType] = useState(""); const [file, setFile] = useState<File>(); const [reason, setReason] = useState("");
  const invalidate = () => void client.invalidateQueries({ queryKey: ["self-service", "affiliate", "beneficiary-change", requestId] });
  const upload = useMutation({ mutationFn: () => selfServiceApi.uploadBeneficiaryDocument(requestId, file!, documentType, state.csrfToken!, idempotencyKey()), onSuccess: invalidate });
  const submit = useMutation({ mutationFn: () => selfServiceApi.submitBeneficiaryRequest(requestId, state.csrfToken!, idempotencyKey()), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => selfServiceApi.cancelBeneficiaryRequest(requestId, state.csrfToken!, idempotencyKey()), onSuccess: invalidate });
  const update = useMutation({ mutationFn: () => { const operation = operationField(query.data?.status === "success" || query.data?.status === "partial" ? query.data.data : {}); if (!operation) throw new Error("Missing provider operation"); return selfServiceApi.updateBeneficiaryDraft(requestId, { operation, reason }, state.csrfToken!, idempotencyKey()); }, onSuccess: invalidate });
  const status = useMemo(() => query.data?.status === "success" || query.data?.status === "partial" ? stringField(query.data.data, "status", "state") : undefined, [query.data]);
  if (query.isPending) return <SelfServiceStatePanel status="loading" />;
  if (query.isError) return <SelfServiceStatePanel status="unavailable" onRetry={() => void query.refetch()} />;
  if (query.data.status !== "success" && query.data.status !== "partial") return <SelfServiceStatePanel status={query.data.status} message={query.data.message} />;
  const draft = status === "DRAFT";
  const cancellable = !["APPLIED", "REJECTED", "CANCELLED"].includes(status ?? "");
  return <div className="space-y-6"><PageHeader title="Solicitud de beneficiario" description="Consulta el estado, completa el borrador y envíalo al proveedor cuando esté listo." eyebrow="Mi cuenta · Beneficiarios" />{status === "APPROVED" && <Alert variant="info" title="Solicitud aprobada">La aprobación no significa que el cambio ya fue aplicado. Consulta este estado hasta que el proveedor informe “Aplicada”.</Alert>}{status === "APPLIED" && <Alert variant="success" title="Cambio aplicado">El proveedor confirmó que el cambio fue aplicado.</Alert>}<ProviderDataView data={query.data.data} />{draft && state.csrfToken && <div className="grid gap-6 xl:grid-cols-2"><Card><h2 className="font-display text-xl font-semibold">Actualizar borrador</h2><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); update.mutate(); }}><div><Label htmlFor="draft-reason">Motivo o ajuste</Label><Textarea id="draft-reason" value={reason} onChange={(event) => setReason(event.target.value)} required className="mt-2" /></div><Button type="submit" loading={update.isPending}>Guardar cambio</Button></form></Card><Card><h2 className="font-display text-xl font-semibold">Adjuntar documento</h2><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (file && documentType) upload.mutate(); }}><div><Label htmlFor="document-type">Tipo de documento</Label><Input id="document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} required className="mt-2" /></div><div><Label htmlFor="document-file">Archivo PDF, JPG o PNG (máximo 5 MB)</Label><Input id="document-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0])} required className="mt-2" /></div><Button type="submit" loading={upload.isPending} disabled={!file}>Adjuntar</Button></form></Card></div>}{draft && !state.csrfToken && <Alert variant="warning">Vuelve a verificar tu identidad antes de modificar este borrador.</Alert>}<Card className="flex flex-wrap gap-3"><Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!draft || !state.csrfToken}>Enviar solicitud</Button><Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending} disabled={!cancellable || !state.csrfToken}>Cancelar solicitud</Button><Link to="/mi-cuenta/beneficiarios" className="inline-flex h-11 items-center rounded-full border border-brand-dark/10 px-5 text-sm font-medium">Volver</Link></Card></div>;
}
