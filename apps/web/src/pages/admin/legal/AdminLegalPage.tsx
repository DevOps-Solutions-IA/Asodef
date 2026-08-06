import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Dialog, EmptyState, ErrorState, PageHeader, Skeleton, Textarea } from "@asodef/ui";
import {
  approveLegalDocumentVersion,
  getLegalDocument,
  listLegalDocuments,
  publishLegalDocumentVersion,
  rejectLegalDocumentVersion,
  submitLegalDocumentForApproval,
  submitLegalDocumentForReview,
  updateLegalDocumentDraft,
} from "../../../lib/admin/admin-legal-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { LEGAL_VERSION_STATUS_LABELS } from "../../../lib/admin/admin-legal-types";
import { ApiError } from "../../../lib/api-error";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

type ConfirmAction = "approve" | "publish" | null;

function contentWarnings(content: unknown): string[] {
  if (!content || typeof content !== "object" || !("sections" in content) || !Array.isArray((content as { sections?: unknown }).sections)) return ["El contenido no contiene una lista válida de secciones."];
  const warnings: string[] = [];
  ((content as { sections: unknown[] }).sections).forEach((section, index) => {
    if (!section || typeof section !== "object") warnings.push(`La sección ${index + 1} no tiene un formato válido.`);
    else {
      const value = section as { heading?: unknown; body?: unknown };
      if (typeof value.heading !== "string" || !value.heading.trim()) warnings.push(`La sección ${index + 1} no tiene título.`);
      if (typeof value.body !== "string" || !value.body.trim()) warnings.push(`La sección ${index + 1} no tiene contenido.`);
      else if (/LEGAL_CONTENT_PLACEHOLDER|Pendiente de confirmación legal|\bPor definir\b|Lorem ipsum|\bTODO\b/i.test(value.body)) warnings.push(`La sección “${String(value.heading || index + 1)}” contiene un marcador no publicable.`);
    }
  });
  return warnings;
}

function validationMessages(error: unknown): string[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.envelope?.errors)) return [];
  return error.envelope.errors.flatMap((item) => item && typeof item === "object" && "message" in item && typeof item.message === "string" ? [item.message] : []);
}

/**
 * US-062 AC1: draft editing + review/approval workflow + publishing, with
 * approve/publish visibly requiring the correct permissions
 * (content.manage vs legal.approve) and a confirmation step.
 */
export function AdminLegalPage() {
  const { hasPermission } = useAuth();
  const canManageContent = hasPermission("content.manage");
  const canApprove = hasPermission("legal.approve");
  const queryClient = useQueryClient();

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null);
  // US-070: which version the detail panel is currently showing - null
  // means "the latest version" (the normal, fully-interactive case).
  // Any other id means the viewer picked a past version from the
  // history list, which is always read-only.
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);

  const documentsQuery = useQuery({ queryKey: queryKeys.admin.legal.documents(), queryFn: ({ signal }) => listLegalDocuments(signal) });
  const documentQuery = useQuery({
    queryKey: queryKeys.admin.legal.document(selectedDocumentId!),
    queryFn: ({ signal }) => getLegalDocument(selectedDocumentId!, signal),
    enabled: !!selectedDocumentId,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.legal.documents() });
    if (selectedDocumentId) void queryClient.invalidateQueries({ queryKey: queryKeys.admin.legal.document(selectedDocumentId) });
  }

  const saveDraftMutation = useMutation({
    mutationFn: (versionId: string) => updateLegalDocumentDraft(versionId, JSON.parse(draftText)),
    onSuccess: invalidate,
  });
  const submitForReviewMutation = useMutation({ mutationFn: submitLegalDocumentForReview, onSuccess: invalidate });
  const submitForApprovalMutation = useMutation({ mutationFn: submitLegalDocumentForApproval, onSuccess: invalidate });
  const rejectMutation = useMutation({ mutationFn: rejectLegalDocumentVersion, onSuccess: invalidate });
  const approveMutation = useMutation({
    mutationFn: approveLegalDocumentVersion,
    onSuccess: () => {
      invalidate();
      setConfirmAction(null);
    },
  });
  const publishMutation = useMutation({
    mutationFn: publishLegalDocumentVersion,
    onSuccess: () => {
      invalidate();
      setConfirmAction(null);
    },
  });

  function selectDocument(documentId: string) {
    setSelectedDocumentId(documentId);
    setDraftText("");
    setDraftError(null);
    setViewedVersionId(null);
  }

  function handleSaveDraft(versionId: string) {
    setDraftError(null);
    try {
      JSON.parse(draftText);
    } catch {
      setDraftError("El contenido debe ser JSON válido.");
      return;
    }
    saveDraftMutation.mutate(versionId);
  }

  const document = documentQuery.data;
  const latestVersion = document?.versions[0];
  // Non-null: only ever read within the `document && latestVersion &&`
  // guarded block below, where latestVersion (the fallback) is defined.
  const viewedVersion = (document?.versions.find((v) => v.id === viewedVersionId) ?? latestVersion)!;
  const isViewingLatest = !viewedVersionId || viewedVersionId === latestVersion?.id;
  const warnings = latestVersion ? contentWarnings(latestVersion.draftContent) : [];
  const workflowError = submitForReviewMutation.error ?? submitForApprovalMutation.error ?? approveMutation.error ?? publishMutation.error;
  const workflowValidationMessages = validationMessages(workflowError);
  const auditTrail = viewedVersion?.auditTrail ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Legal" description="Edición de borradores, flujo de revisión/aprobación y publicación de documentos legales." />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <section aria-labelledby="legal-documents-heading" className="flex flex-col gap-3">
          <h2 id="legal-documents-heading" className="font-display text-lg font-semibold text-text-main">
            Documentos
          </h2>

          {documentsQuery.isLoading && <Skeleton className="h-64 w-full" />}
          {documentsQuery.isError && (
            <ErrorState description={getAdminErrorMessage(documentsQuery.error)} action={<Button onClick={() => documentsQuery.refetch()}>Reintentar</Button>} />
          )}
          {documentsQuery.isSuccess && documentsQuery.data.length === 0 && <EmptyState title="Sin documentos" description="No hay documentos legales registrados." />}

          {documentsQuery.isSuccess && documentsQuery.data.length > 0 && (
            <ul className="flex flex-col gap-1">
              {documentsQuery.data.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => selectDocument(doc.id)}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      selectedDocumentId === doc.id ? "bg-brand-dark/10 font-medium text-brand-dark" : "text-text-main hover:bg-bg-soft"
                    }`}
                  >
                    {doc.title}
                    <span className="block text-xs text-text-muted">{doc.latestVersionStatus ? LEGAL_VERSION_STATUS_LABELS[doc.latestVersionStatus] : "Sin versión"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="legal-document-detail-heading">
          <h2 id="legal-document-detail-heading" className="sr-only">
            Detalle del documento
          </h2>

          {!selectedDocumentId && <EmptyState title="Selecciona un documento" description="Elige un documento de la lista para ver su historial y editarlo." />}

          {selectedDocumentId && documentQuery.isLoading && <Skeleton className="h-64 w-full" />}
          {selectedDocumentId && documentQuery.isError && <ErrorState description={getAdminErrorMessage(documentQuery.error)} />}

          {document && latestVersion && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-main">{document.title}</h3>
                  <p className="text-sm text-text-muted">Versión {viewedVersion.version}{viewedVersion.id === document.currentVersionId ? " · vigente" : ""}</p>
                </div>
                <Badge variant="neutral">{LEGAL_VERSION_STATUS_LABELS[viewedVersion.status] ?? viewedVersion.status}</Badge>
              </div>

              {document.versions.length > 1 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-text-main">Historial de versiones</h4>
                  <ul aria-label="Historial de versiones" className="flex flex-col gap-1">
                    {document.versions.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => setViewedVersionId(v.id === latestVersion.id ? null : v.id)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            v.id === viewedVersion.id ? "bg-brand-dark-50 font-medium text-brand-dark" : "text-text-main hover:bg-bg-soft"
                          }`}
                        >
                          <span>
                            Versión {v.version}
                            {v.id === document.currentVersionId ? " (vigente)" : v.id === latestVersion.id ? " (más reciente)" : ""}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-text-muted">
                            {v.publicationDate ? `Publicada ${formatDate(v.publicationDate)}` : v.approvalDate ? `Aprobada ${formatDate(v.approvalDate)}` : formatDate(v.createdAt)}
                            <Badge variant="neutral">{LEGAL_VERSION_STATUS_LABELS[v.status] ?? v.status}</Badge>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!isViewingLatest && (
                <div className="flex flex-col gap-3">
                  <Alert variant="info">Estás viendo una versión anterior en modo de solo lectura. Solo la versión actual puede editarse.</Alert>
                  {viewedVersion.approvedByUserId && (
                    <p className="text-sm text-text-muted">Aprobada por: {viewedVersion.approvedByName ?? viewedVersion.approvedByUserId} {viewedVersion.approvalDate ? `· ${formatDate(viewedVersion.approvalDate)}` : ""}</p>
                  )}
                  <pre className="overflow-x-auto rounded-xl border border-border-soft bg-bg-soft p-4 text-xs text-text-main">
                    {JSON.stringify(viewedVersion.approvedContent ?? viewedVersion.draftContent, null, 2)}
                  </pre>
                  <Button type="button" variant="outline" className="self-start" onClick={() => setViewedVersionId(null)}>
                    Volver a la versión actual
                  </Button>
                </div>
              )}

              {warnings.length > 0 && isViewingLatest && (
                <Alert variant="warning">
                  <p className="font-medium">Esta versión no puede avanzar todavía.</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </Alert>
              )}

              {workflowValidationMessages.length > 0 && (
                <Alert variant="danger">
                  <p className="font-medium">La validación de publicación encontró:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{workflowValidationMessages.map((message) => <li key={message}>{message}</li>)}</ul>
                </Alert>
              )}

              {Array.isArray(viewedVersion.sourceTraceability) && viewedVersion.sourceTraceability.length > 0 && (
                <div className="rounded-xl border border-border-soft bg-white p-4">
                  <h4 className="text-sm font-semibold text-text-main">Trazabilidad de fuentes</h4>
                  <ul className="mt-2 space-y-2 text-xs text-text-muted">{viewedVersion.sourceTraceability.map((raw, sourceIndex) => {
                    const item = raw as { source?: string; basis?: string };
                    return <li key={`${item.source ?? "source"}-${sourceIndex}`}><span className="font-medium text-text-main">{item.source ?? "Fuente registrada"}</span>{item.basis ? ` — ${item.basis}` : ""}</li>;
                  })}</ul>
                </div>
              )}

              {document.versions.length > 1 && document.versions[1] && isViewingLatest && (
                <details className="rounded-xl border border-border-soft bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-dark">Comparar con la versión anterior</summary>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div><p className="mb-2 text-xs font-semibold text-text-muted">Versión {latestVersion.version}</p><pre className="max-h-80 overflow-auto rounded-lg bg-bg-soft p-3 text-xs">{JSON.stringify(latestVersion.approvedContent ?? latestVersion.draftContent, null, 2)}</pre></div>
                    <div><p className="mb-2 text-xs font-semibold text-text-muted">Versión {document.versions[1]?.version}</p><pre className="max-h-80 overflow-auto rounded-lg bg-bg-soft p-3 text-xs">{JSON.stringify(document.versions[1]?.approvedContent ?? document.versions[1]?.draftContent, null, 2)}</pre></div>
                  </div>
                </details>
              )}

              {auditTrail.length > 0 && (
                <details className="rounded-xl border border-border-soft bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-dark">Actores y eventos del workflow ({auditTrail.length})</summary>
                  <ol className="mt-3 space-y-2 text-xs text-text-muted">{auditTrail.map((event, eventIndex) => <li key={`${event.action}-${event.createdAt}-${eventIndex}`}><span className="font-medium text-text-main">{event.action}</span> · {event.actorName ?? "Sistema"} · {formatDate(event.createdAt)}{event.applied ? "" : " · bloqueado"}</li>)}</ol>
                </details>
              )}

              {isViewingLatest && latestVersion.status === "DRAFT" && (
                <div>
                  <label htmlFor="draft-content" className="mb-1.5 block text-sm font-medium text-text-main">
                    Contenido (JSON)
                  </label>
                  <Textarea
                    id="draft-content"
                    rows={10}
                    disabled={!canManageContent}
                    value={draftText || JSON.stringify(latestVersion.draftContent, null, 2)}
                    onChange={(event) => setDraftText(event.target.value)}
                  />
                  {draftError && <p className="mt-1 text-sm text-danger">{draftError}</p>}
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canManageContent || saveDraftMutation.isPending}
                      title={!canManageContent ? "No tienes permiso para editar contenido legal." : undefined}
                      onClick={() => handleSaveDraft(latestVersion.id)}
                    >
                      Guardar borrador
                    </Button>
                    <Button
                      type="button"
                      disabled={!canManageContent || submitForReviewMutation.isPending || warnings.length > 0}
                      title={!canManageContent ? "No tienes permiso para editar contenido legal." : undefined}
                      onClick={() => submitForReviewMutation.mutate(latestVersion.id)}
                    >
                      Enviar a revisión legal
                    </Button>
                  </div>
                  {saveDraftMutation.isError && <ErrorState description={getAdminErrorMessage(saveDraftMutation.error)} />}
                </div>
              )}

              {isViewingLatest && latestVersion.status === "LEGAL_REVIEW" && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={!canManageContent || submitForApprovalMutation.isPending}
                    title={!canManageContent ? "No tienes permiso para editar contenido legal." : undefined}
                    onClick={() => submitForApprovalMutation.mutate(latestVersion.id)}
                  >
                    Enviar a aprobación
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManageContent || rejectMutation.isPending}
                    title={!canManageContent ? "No tienes permiso para editar contenido legal." : undefined}
                    onClick={() => rejectMutation.mutate(latestVersion.id)}
                  >
                    Rechazar (volver a borrador)
                  </Button>
                </div>
              )}

              {isViewingLatest && latestVersion.status === "PENDING_APPROVAL" && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={!canApprove}
                    title={!canApprove ? "No tienes permiso para aprobar documentos legales." : undefined}
                    onClick={() => {
                      setPendingVersionId(latestVersion.id);
                      setConfirmAction("approve");
                    }}
                  >
                    Aprobar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManageContent || rejectMutation.isPending}
                    title={!canManageContent ? "No tienes permiso para editar contenido legal." : undefined}
                    onClick={() => rejectMutation.mutate(latestVersion.id)}
                  >
                    Rechazar (volver a borrador)
                  </Button>
                </div>
              )}

              {isViewingLatest && latestVersion.status === "APPROVED" && (
                <Button
                  type="button"
                  disabled={!canApprove}
                  title={!canApprove ? "No tienes permiso para publicar documentos legales." : undefined}
                  onClick={() => {
                    setPendingVersionId(latestVersion.id);
                    setConfirmAction("publish");
                  }}
                >
                  Publicar
                </Button>
              )}

              {isViewingLatest && latestVersion.status === "PUBLISHED" && (
                <p className="text-sm text-success">
                  Publicado el {latestVersion.publicationDate ? formatDate(latestVersion.publicationDate) : "—"}. Visible en /legal/{document.slug}.
                </p>
              )}

              {rejectMutation.isError && <ErrorState description={getAdminErrorMessage(rejectMutation.error)} />}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={confirmAction === "approve"}
        onClose={() => setConfirmAction(null)}
        title="Aprobar versión"
        description="Esta acción aprueba el contenido actual del borrador. ¿Deseas continuar?"
      >
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => setConfirmAction(null)} disabled={approveMutation.isPending}>
            Cancelar
          </Button>
          <Button type="button" loading={approveMutation.isPending} onClick={() => pendingVersionId && approveMutation.mutate(pendingVersionId)}>
            Confirmar aprobación
          </Button>
        </div>
        {approveMutation.isError && <ErrorState description={getAdminErrorMessage(approveMutation.error)} />}
      </Dialog>

      <Dialog
        open={confirmAction === "publish"}
        onClose={() => setConfirmAction(null)}
        title="Publicar versión"
        description="Esta versión quedará visible de inmediato en su ruta pública /legal/*. ¿Deseas continuar?"
      >
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => setConfirmAction(null)} disabled={publishMutation.isPending}>
            Cancelar
          </Button>
          <Button type="button" loading={publishMutation.isPending} onClick={() => pendingVersionId && publishMutation.mutate(pendingVersionId)}>
            Confirmar publicación
          </Button>
        </div>
        {publishMutation.isError && <ErrorState description={getAdminErrorMessage(publishMutation.error)} />}
      </Dialog>
    </div>
  );
}
