import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Select, StatusBadge, Textarea } from "@asodef/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, FileDiff, Search } from "lucide-react";
import { useAuth } from "../../lib/auth/auth-context";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { createFileDraft, createManualDraft, getKnowledgeDiff, getKnowledgeItem, listKnowledgeItems, previewKnowledge, retrievePublishedKnowledge, transitionKnowledge } from "./knowledge.api";
import type { DataClassification, DraftInput, KnowledgeAudience, KnowledgeDomain, KnowledgeFilters, KnowledgeStatus, KnowledgeVersion } from "./knowledge.types";

const DOMAINS: KnowledgeDomain[] = ["ASODEF_INSTITUCIONAL", "SERVICIOS_Y_PROTECCION", "AFILIACIONES", "PLANES_Y_COBERTURAS", "BENEFICIARIOS", "REQUISITOS", "BENEFICIOS_Y_CONVENIOS", "AUXILIOS_Y_PROTECCIONES", "SOLICITUD_DE_SERVICIO", "PAGOS_ORIENTACION", "PQR", "ACTUALIZACION_DE_DATOS", "CONTACTO_Y_CANALES", "PREGUNTAS_FRECUENTES"];
const AUDIENCES: KnowledgeAudience[] = ["PUBLIC", "AUTHENTICATED_AFFILIATE", "INTERNAL", "ADMIN_ONLY"];
const CLASSIFICATIONS: DataClassification[] = ["PUBLIC", "INTERNAL", "PERSONAL", "SENSITIVE", "HIGHLY_SENSITIVE"];
const DEFAULT_FILTERS: KnowledgeFilters = { page: 1, pageSize: 30 };
const EMPTY_DRAFT: DraftInput = { title: "", stableKey: "", domain: "ASODEF_INSTITUCIONAL", audience: "PUBLIC", classification: "PUBLIC", language: "es", sourceReference: "manual://admin", sourceOwner: "ASODEF", changeReason: "", content: "" };

export function KnowledgeAdminPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("knowledge.manage");
  const canPublish = hasPermission("knowledge.publish");
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftInput>(EMPTY_DRAFT);
  const [createMode, setCreateMode] = useState<"NEW_ITEM" | "NEW_VERSION">("NEW_ITEM");
  const [ingestion, setIngestion] = useState<"MANUAL" | "FILE">("MANUAL");
  const [file, setFile] = useState<File | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [previewQuery, setPreviewQuery] = useState("");
  const [retrievalQuery, setRetrievalQuery] = useState("");

  const list = useQuery({ queryKey: queryKeys.admin.knowledge.list(filters), queryFn: ({ signal }) => listKnowledgeItems(filters, signal) });
  const detail = useQuery({ queryKey: queryKeys.admin.knowledge.item(selectedItemId ?? "none"), queryFn: ({ signal }) => getKnowledgeItem(selectedItemId!, signal), enabled: Boolean(selectedItemId) });
  const selectedVersion = detail.data?.versions?.find((version) => version.id === selectedVersionId) ?? detail.data?.versions?.[0] ?? null;
  const diff = useMutation({
    mutationFn: (versionId: string) =>
      stepUp.execute(() => getKnowledgeDiff(versionId)),
  });

  useEffect(() => {
    if (!selectedItemId && list.data?.items[0]) setSelectedItemId(list.data.items[0].id);
  }, [list.data, selectedItemId]);
  useEffect(() => {
    if (detail.data?.versions[0] && !detail.data.versions.some(({ id }) => id === selectedVersionId)) setSelectedVersionId(detail.data.versions[0].id);
  }, [detail.data, selectedVersionId]);

  const refresh = async (itemId?: string) => {
    if (itemId) setSelectedItemId(itemId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.knowledge.all() });
  };
  const create = useMutation({
    mutationFn: () => stepUp.execute(async () => {
      const existing = createMode === "NEW_VERSION" ? detail.data : null;
      const input: DraftInput = { ...draft, ...(existing ? { knowledgeItemId: existing.id, expectedItemRevision: existing.revision, stableKey: undefined } : {}) };
      if (ingestion === "FILE") {
        if (!file) throw new Error("Selecciona un archivo permitido.");
        return createFileDraft(input, file);
      }
      return createManualDraft(input);
    }),
    onSuccess: async (version) => {
      setDraft(EMPTY_DRAFT);
      setFile(null);
      setSelectedVersionId(version.id);
      await refresh(version.knowledgeItemId);
    },
  });
  const lifecycle = useMutation({
    mutationFn: ({ version, action }: { version: KnowledgeVersion; action: LifecycleAction }) => stepUp.execute(() => transitionKnowledge(version.id, action, version.revision, changeReason.trim())),
    onSuccess: async (version) => { setChangeReason(""); setSelectedVersionId(version.id); await refresh(version.knowledgeItemId); },
  });
  const preview = useMutation({ mutationFn: () => stepUp.execute(() => previewKnowledge(selectedVersion!.id, previewQuery.trim())) });
  const retrieval = useMutation({ mutationFn: () => retrievePublishedKnowledge(retrievalQuery.trim(), [selectedVersion?.domain ?? "ASODEF_INSTITUCIONAL"]) });
  const mutationError = create.error ?? lifecycle.error ?? preview.error ?? retrieval.error ?? diff.error;

  const submitDraft = (event: FormEvent) => { event.preventDefault(); create.mutate(); };
  const actions = selectedVersion ? lifecycleActions(selectedVersion.status, canManage, canPublish) : [];
  const audit = useMemo(() => detail.data?.versions.flatMap((version) => version.auditEvents ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [], [detail.data]);

  return <div className="flex flex-col gap-6">
    {stepUp.dialog}
    <PageHeader eyebrow="Koral · Conocimiento gobernado" title="Conocimiento" description="Administra fuentes, versiones, publicación, recuperación y trazabilidad reales sobre PostgreSQL." icon={<BookOpenCheck aria-hidden="true" className="h-5 w-5" />} actions={<StatusBadge tone="success" label="RUNTIME REAL" />} />
    {mutationError && !isStepUpCancelledError(mutationError) && <Alert variant="danger" title="No se pudo completar la operación">{getAdminErrorMessage(mutationError)}</Alert>}

    <section aria-label="Filtros de conocimiento" className="grid gap-3 rounded-xl3 border border-border-soft bg-white p-4 md:grid-cols-4">
      <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">Buscar items o títulos</span><Input type="search" value={filters.search ?? ""} onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })} /></label>
      <Filter label="Dominio" value={filters.domain ?? ""} options={DOMAINS} onChange={(value) => setFilters({ ...filters, domain: (value || undefined) as KnowledgeDomain | undefined, page: 1 })} />
      <Filter label="Audiencia" value={filters.audience ?? ""} options={AUDIENCES} onChange={(value) => setFilters({ ...filters, audience: (value || undefined) as KnowledgeAudience | undefined, page: 1 })} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(18rem,.7fr)_minmax(0,1.6fr)]">
      <section aria-labelledby="knowledge-items-heading" className="rounded-xl3 border border-border-soft bg-white p-4 shadow-e1">
        <h2 id="knowledge-items-heading" className="font-display text-lg font-semibold">Knowledge Items</h2>
        {list.isPending && <p aria-live="polite" className="mt-4 text-sm text-text-muted">Cargando conocimiento…</p>}
        {list.isError && <Alert variant="danger">{getAdminErrorMessage(list.error)}</Alert>}
        {list.data?.items.length === 0 && <EmptyState title="Sin conocimiento" description="Crea el primer item gobernado; no se muestran datos ficticios." />}
        <div className="mt-3 space-y-2">{list.data?.items.map((item) => <button key={item.id} type="button" aria-current={selectedItemId === item.id ? "true" : undefined} onClick={() => { setSelectedItemId(item.id); setSelectedVersionId(item.versions[0]?.id ?? null); }} className={`w-full rounded-xl border p-3 text-left ${selectedItemId === item.id ? "border-brand-accent bg-brand-accent/5" : "border-border-soft"}`}><span className="block font-semibold">{item.versions[0]?.title ?? item.stableKey}</span><span className="mt-1 block text-xs text-text-muted">{item.stableKey} · {item.versions.length} versión(es)</span><div className="mt-2 flex flex-wrap gap-1">{item.versions.slice(0, 3).map((version) => <Badge key={version.id} variant="neutral">v{version.version} {version.status}</Badge>)}</div></button>)}</div>
      </section>

      <div className="min-w-0 space-y-6">
        <KnowledgeDetail detail={detail.data} selectedVersion={selectedVersion} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} actions={actions} changeReason={changeReason} onReason={setChangeReason} onAction={(action) => selectedVersion && lifecycle.mutate({ version: selectedVersion, action })} pending={lifecycle.isPending} diff={diff.variables === selectedVersion?.id ? diff.data : undefined} diffPending={diff.isPending} onLoadDiff={() => selectedVersion && diff.mutate(selectedVersion.id)} audit={audit} />
        <section aria-labelledby="knowledge-preview-heading" className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"><h2 id="knowledge-preview-heading" className="font-display text-lg font-semibold">Vista previa y retrieval publicado</h2><div className="mt-4 grid gap-4 lg:grid-cols-2"><QueryPanel label="Preview administrativo" value={previewQuery} onChange={setPreviewQuery} button="Previsualizar versión" disabled={!selectedVersion || !previewQuery.trim() || preview.isPending} onRun={() => preview.mutate()} result={preview.data} /><QueryPanel label="Retrieval Koral publicado" value={retrievalQuery} onChange={setRetrievalQuery} button="Consultar evidencia publicada" disabled={!selectedVersion || !retrievalQuery.trim() || retrieval.isPending} onRun={() => retrieval.mutate()} result={retrieval.data} /></div></section>
      </div>
    </div>

    {canManage && <section aria-labelledby="create-knowledge-heading" className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"><h2 id="create-knowledge-heading" className="font-display text-lg font-semibold">Crear DRAFT</h2><form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={submitDraft}><Filter label="Destino" value={createMode} options={["NEW_ITEM", "NEW_VERSION"]} labels={{ NEW_ITEM: "Nuevo Knowledge Item", NEW_VERSION: "Nueva versión del item seleccionado" }} onChange={(value) => setCreateMode(value as typeof createMode)} /><Filter label="Ingesta" value={ingestion} options={["MANUAL", "FILE"]} labels={{ MANUAL: "Autoría manual", FILE: "Archivo" }} onChange={(value) => setIngestion(value as typeof ingestion)} />{createMode === "NEW_ITEM" && <Field label="Stable key"><Input required value={draft.stableKey ?? ""} pattern="[a-z0-9][a-z0-9_-]{1,99}" onChange={(event) => setDraft({ ...draft, stableKey: event.target.value })} /></Field>}<Field label="Título"><Input required value={draft.title} maxLength={300} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field><Filter label="Dominio" value={draft.domain} options={DOMAINS} onChange={(value) => setDraft({ ...draft, domain: value as KnowledgeDomain })} /><Filter label="Audiencia" value={draft.audience} options={AUDIENCES} onChange={(value) => setDraft({ ...draft, audience: value as KnowledgeAudience })} /><Filter label="Clasificación" value={draft.classification} options={CLASSIFICATIONS} onChange={(value) => setDraft({ ...draft, classification: value as DataClassification })} /><Field label="Referencia de fuente"><Input required value={draft.sourceReference} onChange={(event) => setDraft({ ...draft, sourceReference: event.target.value })} /></Field><Field label="Propietario de fuente"><Input required value={draft.sourceOwner} onChange={(event) => setDraft({ ...draft, sourceOwner: event.target.value })} /></Field><Field label="Vigente desde"><Input type="datetime-local" value={draft.effectiveFrom ?? ""} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></Field><Field label="Vigente hasta"><Input type="datetime-local" value={draft.effectiveUntil ?? ""} onChange={(event) => setDraft({ ...draft, effectiveUntil: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></Field>{ingestion === "MANUAL" ? <Field label="Contenido en español" className="md:col-span-2"><Textarea required rows={10} value={draft.content ?? ""} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></Field> : <Field label="Archivo .md, .txt, .pdf o .docx" className="md:col-span-2"><Input required type="file" accept=".md,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>}<Field label="Motivo del cambio" className="md:col-span-2"><Textarea required value={draft.changeReason} onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })} /></Field><div className="md:col-span-2"><Button type="submit" loading={create.isPending} disabled={createMode === "NEW_VERSION" && !detail.data}>Crear versión DRAFT</Button></div></form></section>}
  </div>;
}

type LifecycleAction = "submit-review" | "return-draft" | "approve" | "publish" | "retire";
function lifecycleActions(status: KnowledgeStatus, manage: boolean, publish: boolean): Array<{ action: LifecycleAction; label: string }> { if (status === "DRAFT" && manage) return [{ action: "submit-review", label: "Enviar a REVIEW" }]; if (status === "REVIEW") return [...(manage ? [{ action: "return-draft" as const, label: "Devolver a DRAFT" }] : []), ...(publish ? [{ action: "approve" as const, label: "Aprobar" }] : [])]; if (status === "APPROVED" && publish) return [{ action: "publish", label: "Publicar" }, { action: "retire", label: "Retirar" }]; if (status === "PUBLISHED" && publish) return [{ action: "retire", label: "Retirar" }]; return []; }

function KnowledgeDetail({ detail, selectedVersion, selectedVersionId, onSelectVersion, actions, changeReason, onReason, onAction, pending, diff, diffPending, onLoadDiff, audit }: { detail: import("./knowledge.types").KnowledgeItem | undefined; selectedVersion: KnowledgeVersion | null; selectedVersionId: string | null; onSelectVersion: (id: string) => void; actions: Array<{ action: LifecycleAction; label: string }>; changeReason: string; onReason: (value: string) => void; onAction: (action: LifecycleAction) => void; pending: boolean; diff: import("./knowledge.types").KnowledgeDiff | undefined; diffPending: boolean; onLoadDiff: () => void; audit: import("./knowledge.types").KnowledgeAuditEvent[] }) {
  if (!detail || !selectedVersion) return <section className="rounded-xl3 border border-border-soft bg-white p-6"><EmptyState title="Selecciona un Knowledge Item" description="Consulta sus versiones, fuentes y trazabilidad." /></section>;
  return <section aria-labelledby="knowledge-detail-heading" className="rounded-xl3 border border-border-soft bg-white p-5 shadow-e1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="knowledge-detail-heading" className="font-display text-xl font-semibold">{selectedVersion.title}</h2><p className="text-sm text-text-muted">{detail.stableKey} · tenant {detail.tenantKey}</p></div><StatusBadge tone={selectedVersion.status === "PUBLISHED" ? "success" : selectedVersion.status === "RETIRED" ? "inactive" : "warning"} label={selectedVersion.status} /></div><div className="mt-4 flex flex-wrap gap-2" aria-label="Versiones">{detail.versions.map((version) => <Button key={version.id} size="sm" variant={selectedVersionId === version.id ? "primary" : "outline"} onClick={() => onSelectVersion(version.id)}>v{version.version}</Button>)}</div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Meta term="Audiencia" value={selectedVersion.audience} /><Meta term="Clasificación" value={selectedVersion.classification} /><Meta term="Idioma" value={selectedVersion.language} /><Meta term="Revisión CAS" value={String(selectedVersion.revision)} /><Meta term="Fuente" value={`${selectedVersion.source?.sourceType ?? "UNKNOWN"} · ${selectedVersion.source?.sourceReference ?? "Sin fuente"}`} /><Meta term="Vigencia" value={`${formatDate(selectedVersion.effectiveFrom)} → ${formatDate(selectedVersion.effectiveUntil)}`} /></dl><div className="mt-5"><h3 className="font-semibold">Acciones de lifecycle</h3><Textarea className="mt-2" aria-label="Motivo de lifecycle" placeholder="Motivo obligatorio y auditable" value={changeReason} onChange={(event) => onReason(event.target.value)} /><div className="mt-2 flex flex-wrap gap-2">{actions.map(({ action, label }) => <Button key={action} size="sm" disabled={!changeReason.trim() || pending} onClick={() => onAction(action)}>{label}</Button>)}</div></div><details className="mt-5"><summary className="cursor-pointer font-semibold"><FileDiff className="mr-2 inline h-4 w-4" />Diff de versiones</summary><Button className="mt-3" size="sm" variant="outline" loading={diffPending} onClick={onLoadDiff}>Consultar diff gobernado</Button>{diff && <div className="mt-3 grid gap-3 lg:grid-cols-2"><VersionText title={diff.previous ? `v${diff.previous.version} anterior` : "Sin versión anterior"} content={diff.previous?.content ?? ""} /><VersionText title={`v${diff.current.version} actual`} content={diff.current.content} /></div>}</details><details className="mt-5"><summary className="cursor-pointer font-semibold">Audit trail ({audit.length})</summary><ol className="mt-3 space-y-2">{audit.map((event) => <li key={event.id} className="rounded-xl bg-surface-muted p-3 text-sm"><strong>{event.action}</strong><span className="block text-xs text-text-muted">{event.previousStatus ?? "—"} → {event.nextStatus ?? "—"} · {new Date(event.createdAt).toLocaleString("es-CO")}</span><span>{event.changeReason ?? "Sin motivo"}</span></li>)}</ol></details></section>;
}

function QueryPanel({ label, value, onChange, button, disabled, onRun, result }: { label: string; value: string; onChange: (value: string) => void; button: string; disabled: boolean; onRun: () => void; result: unknown }) { const data = result as { outcome?: string; citations?: Array<{ excerpt: string }>; response?: { outcome: string; citations: Array<{ excerpt: string }> } } | undefined; const outcome = data?.outcome ?? data?.response?.outcome; const citations = data?.citations ?? data?.response?.citations ?? []; return <div><label><span className="mb-1 block text-sm font-medium">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></label><Button className="mt-2" size="sm" variant="outline" disabled={disabled} onClick={onRun}><Search className="mr-1 h-4 w-4" />{button}</Button>{outcome && <div aria-live="polite" className="mt-3 rounded-xl bg-surface-muted p-3 text-sm"><strong>Outcome: {outcome}</strong>{citations.map((citation, index) => <p key={index} className="mt-2">{citation.excerpt}</p>)}</div>}</div>; }
function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>; }
function Filter({ label, value, options, labels, onChange }: { label: string; value: string; options: readonly string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <Field label={label}><Select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option.replaceAll("_", " ")}</option>)}</Select></Field>; }
function Meta({ term, value }: { term: string; value: string }) { return <div><dt className="text-xs uppercase tracking-wide text-text-muted">{term}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>; }
function VersionText({ title, content }: { title: string; content: string }) { return <div><h4 className="text-sm font-semibold">{title}</h4><pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-xs">{content || "No disponible"}</pre></div>; }
function formatDate(value: string | null): string { return value ? new Date(value).toLocaleDateString("es-CO") : "sin límite"; }
