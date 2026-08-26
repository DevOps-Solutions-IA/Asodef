import type { ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
  type StatusTone,
} from "@asodef/ui";
import {
  BarChart3,
  Bot,
  Gauge,
  Network,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import {
  getKoralAgents,
  getKoralAnalytics,
  getKoralAutomations,
  getKoralControlPlaneOverview,
  getKoralTools,
} from "./koral-control-plane.api";
import { queryKeys } from "../../lib/query-keys";
import type {
  KoralAgentsResponse,
  KoralAnalyticsResponse,
  KoralAutomationsResponse,
  KoralControlPlaneOverview,
  KoralRuntimeStatus,
  KoralToolsResponse,
} from "./koral-control-plane.types";

const DEFAULT_WINDOW_HOURS = 24;

export function KoralOverviewPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.koralControlPlane.overview(),
    queryFn: ({ signal }) => getKoralControlPlaneOverview(signal),
  });
  return (
    <KoralQueryPage
      title="Resumen"
      description="Actividad y capacidad efectiva de Koral, sin inferir salud técnica ni configuración inexistente."
      icon={<Gauge aria-hidden="true" className="h-5 w-5" />}
      query={query}
    >
      {(data) => <OverviewContent data={data} />}
    </KoralQueryPage>
  );
}

export function KoralAgentsPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.koralControlPlane.agents(),
    queryFn: ({ signal }) => getKoralAgents(signal),
  });
  return (
    <KoralQueryPage
      title="Agentes"
      description="Perfiles y políticas que el runtime canónico expone en modo de solo lectura."
      icon={<Bot aria-hidden="true" className="h-5 w-5" />}
      query={query}
    >
      {(data) => <AgentsContent data={data} />}
    </KoralQueryPage>
  );
}

export function KoralToolsPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.koralControlPlane.tools(),
    queryFn: ({ signal }) => getKoralTools(signal),
  });
  return (
    <KoralQueryPage
      title="Herramientas"
      description="Gobierno del Tool Gateway y sus dependencias reales, sin habilitar ejecución desde el navegador."
      icon={<Wrench aria-hidden="true" className="h-5 w-5" />}
      query={query}
    >
      {(data) => <ToolsContent data={data} />}
    </KoralQueryPage>
  );
}

export function KoralAutomationsPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.koralControlPlane.automations(DEFAULT_WINDOW_HOURS, 20),
    queryFn: ({ signal }) =>
      getKoralAutomations(DEFAULT_WINDOW_HOURS, 20, signal),
  });
  return (
    <KoralQueryPage
      title="Automatizaciones"
      description="Definiciones, ejecuciones y dead letters observados por el runtime canónico."
      icon={<Network aria-hidden="true" className="h-5 w-5" />}
      query={query}
    >
      {(data) => <AutomationsContent data={data} />}
    </KoralQueryPage>
  );
}

export function KoralAnalyticsPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.koralControlPlane.analytics(DEFAULT_WINDOW_HOURS),
    queryFn: ({ signal }) => getKoralAnalytics(DEFAULT_WINDOW_HOURS, signal),
  });
  return (
    <KoralQueryPage
      title="Analítica"
      description="Volumen operativo y cobertura de telemetría disponible, sin fabricar costos ni métricas."
      icon={<BarChart3 aria-hidden="true" className="h-5 w-5" />}
      query={query}
    >
      {(data) => <AnalyticsContent data={data} />}
    </KoralQueryPage>
  );
}

function KoralQueryPage<T>({
  title,
  description,
  icon,
  query,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Koral · Control Plane"
        title={title}
        description={description}
        icon={icon}
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-busy={query.isFetching}
          >
            <RefreshCw
              aria-hidden="true"
              className={query.isFetching ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"}
            />
            {query.isFetching ? "Actualizando…" : "Actualizar"}
          </Button>
        }
      />
      {query.isPending && <KoralPageSkeleton />}
      {query.isError && (
        <ErrorState
          description={getAdminErrorMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
        />
      )}
      {query.isSuccess && children(query.data)}
    </div>
  );
}

function KoralPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only" role="status">Cargando datos de Koral…</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function OverviewContent({ data }: { data: KoralControlPlaneOverview }) {
  return (
    <div className="space-y-6">
      <RuntimeBanner status={data.runtime.status} generatedAt={data.generatedAt} />
      <MetricSection title="Conversaciones" id="koral-conversation-summary">
        <MetricGrid>
          <Metric label="Total" value={data.conversations.total} />
          <Metric label="Activas" value={data.conversations.active} />
          <Metric label="Koral activo" value={data.conversations.aiActive} />
          <Metric label="Requieren atención humana" value={data.conversations.humanRequired} />
          <Metric label="Atención humana activa" value={data.conversations.humanActive} />
          <Metric label="Esperando usuario" value={data.conversations.waitingUser} />
          <Metric label="Handoffs pendientes" value={data.handoff.pending} />
          <Metric label="Handoffs activos" value={data.handoff.active} />
        </MetricGrid>
      </MetricSection>
      <MetricSection title="Capacidad gobernada" id="koral-capacity-summary">
        <MetricGrid>
          <Metric label="Perfiles de agente" value={data.runtime.agentProfiles.total} />
          <Metric label="Perfiles publicados" value={data.runtime.agentProfiles.published} />
          <Metric label="Perfiles configurados" value={data.runtime.agentProfiles.configured} />
          <Metric label="Automatizaciones" value={data.automations.total} />
          <Metric label="Automatizaciones activas" value={data.automations.active} />
          <Metric label="Ejecuciones de automatización" value={data.automations.executions} />
          <Metric label="Dead letters sin resolver" value={data.automations.unresolvedDeadLetters} />
          <Metric label={`Eventos (${data.telemetry.windowHours} h)`} value={data.telemetry.conversationEvents} />
        </MetricGrid>
      </MetricSection>
      <MetricSection title="Conocimiento" id="koral-knowledge-summary">
        <MetricGrid>
          <Metric label="Items" value={data.knowledge.items} />
          <Metric label="Versiones" value={data.knowledge.versions} />
          <Metric label="Publicadas" value={data.knowledge.published} />
          <Metric label="Publicadas elegibles" value={data.knowledge.eligiblePublished} />
        </MetricGrid>
        <div className="mt-4"><CountBreakdown title="Versiones por estado" total={data.knowledge.versions} values={data.knowledge.byStatus} empty="No hay versiones de conocimiento." /></div>
      </MetricSection>
      <FactGrid>
        <Fact term="Runtime de automatización" value={data.automations.executionRuntime} />
        <Fact term="Persistencia de uso IA" value={data.telemetry.aiUsagePersistence} />
        <Fact term="Tool Gateway registrado" value={yesNo(data.runtime.toolGateway.registered)} />
        <Fact term="Herramientas ejecutables" value={String(data.runtime.toolGateway.executable)} />
        <Fact term="Latencia media de procesamiento" value={data.telemetry.processingLatencyMs ? `${data.telemetry.processingLatencyMs.average} ms` : "UNKNOWN"} />
        <Fact term="Latencia p95 de procesamiento" value={data.telemetry.processingLatencyMs ? `${data.telemetry.processingLatencyMs.p95} ms` : "UNKNOWN"} />
      </FactGrid>
      <div className="grid gap-6 lg:grid-cols-3">
        <CountBreakdown title="Procesamiento reciente" total={sumCounts(data.telemetry.processingByStatus)} values={data.telemetry.processingByStatus} empty="Sin procesamiento reciente." />
        <CountBreakdown title="Grounding reciente" total={sumCounts(data.telemetry.retrievalByResult)} values={data.telemetry.retrievalByResult} empty="Sin retrieval reciente." />
        <CountBreakdown title="Fallos recientes" total={sumCounts(data.telemetry.failuresByCode)} values={data.telemetry.failuresByCode} empty="Sin fallos registrados." />
      </div>
      <MetricSection title="Actividad reciente" id="koral-recent-activity">
        {data.telemetry.recentActivity.length === 0 ? <EmptyState title="Sin actividad reciente" description="No hay eventos persistidos en la ventana observada." /> : <ol className="space-y-2">{data.telemetry.recentActivity.map((event) => <li key={event.id} className="rounded-xl border border-border-soft bg-white p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{event.eventType}</strong><time className="text-xs text-text-muted">{formatDateTime(event.createdAt)}</time></div><span className="block text-xs text-text-muted">{event.result}</span>{event.correlationId && <span className="block break-all text-xs text-text-muted">Correlación: {event.correlationId}</span>}</li>)}</ol>}
      </MetricSection>
    </div>
  );
}

function AgentsContent({ data }: { data: KoralAgentsResponse }) {
  return (
    <div className="space-y-5">
      <RuntimeBanner status={data.runtime.status} generatedAt={data.generatedAt} />
      <MetricSection title="Dependencias del runtime" id="koral-agent-runtime-dependencies">
        <FactGrid>
          <Fact term="Runtime IA habilitado" value={yesNo(data.runtime.aiRuntimeEnabled)} />
          <Fact term="Proveedor configurado" value={yesNo(data.runtime.providerConfigured)} />
          <Fact term="Knowledge Gateway" value={data.runtime.knowledgeGateway.availability} />
          <Fact term="Versiones publicadas" value={data.runtime.knowledgeGateway.publishedVersions === null ? "UNKNOWN" : formatNumber(data.runtime.knowledgeGateway.publishedVersions)} />
          <Fact term="Tool Gateway" value={data.runtime.toolGateway.availability} />
          <Fact term="Herramientas ejecutables" value={formatNumber(data.runtime.toolGateway.executable)} />
          <Fact term="Timeout" value={`${data.runtime.providerPolicy.timeoutMs} ms`} />
          <Fact term="Intentos máximos" value={formatNumber(data.runtime.providerPolicy.maxAttempts)} />
          <Fact term="Umbral del circuito" value={formatNumber(data.runtime.providerPolicy.circuitFailureThreshold)} />
          <Fact term="Reinicio del circuito" value={`${data.runtime.providerPolicy.circuitResetMs} ms`} />
        </FactGrid>
      </MetricSection>
      {data.agents.length === 0 ? (
        <EmptyState title="No hay perfiles de agente" description="El runtime no publicó perfiles administrables para esta vista." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
          <table className="min-w-[70rem] w-full text-left text-sm">
            <caption className="sr-only">Perfiles de agentes disponibles en el runtime de Koral</caption>
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
              <tr><ColumnHeader>Agente</ColumnHeader><ColumnHeader>Estado</ColumnHeader><ColumnHeader>Modelo</ColumnHeader><ColumnHeader>Políticas</ColumnHeader><ColumnHeader>Límites</ColumnHeader><ColumnHeader>Herramientas</ColumnHeader></tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {data.agents.map((agent) => (
                <tr key={agent.agentProfileKey}>
                  <RowHeader><span className="block font-semibold">{agent.name}</span><span className="block text-xs text-text-muted">{agent.agentProfileKey} · v{agent.version}</span><span className="mt-1 block text-xs text-text-muted">{agent.purpose}</span></RowHeader>
                  <Cell><Badge variant="neutral">{agent.status}</Badge><div className="mt-2"><StatusBadge tone={agent.runtimeConfigured ? "success" : "inactive"} label={agent.runtimeConfigured ? "Configurado" : "No configurado"} /></div></Cell>
                  <Cell><span className="block font-medium">{agent.primaryModel}</span><span className="block text-xs text-text-muted">Fallback: {joinOrUnknown(agent.fallbackModels)}</span><span className="block text-xs text-text-muted">Proveedores: {joinOrUnknown(agent.allowedProviders)}</span></Cell>
                  <Cell><span className="block">Aprobada: {yesNo(agent.policyApproved)}</span><SanitizedJson label="Política de clasificación" value={agent.dataClassificationPolicy} /><SanitizedJson label="Política de presupuesto" value={agent.budgetPolicy} /></Cell>
                  <Cell><span className="block">Entrada: {formatNumber(agent.maxInputTokens)}</span><span className="block">Salida: {formatNumber(agent.maxOutputTokens)}</span><span className="block">Salida estructurada: {yesNo(agent.structuredOutputRequired)}</span></Cell>
                  <Cell>{yesNo(agent.toolCallingAllowed)}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ToolsContent({ data }: { data: KoralToolsResponse }) {
  return (
    <div className="space-y-6">
      <Alert variant="warning" title="Tool Gateway no ejecutable desde el Control Plane">
        Estado reportado: {data.runtime.reason}. Esta pantalla no ejecuta herramientas.
      </Alert>
      <MetricGrid>
        <Metric label="Total" value={data.summary.total} />
        <Metric label="Publicadas" value={data.summary.published} />
        <Metric label="En revisión" value={data.summary.review} />
        <Metric label="Ejecutables" value={data.summary.executable} />
      </MetricGrid>
      {data.dependencies.length > 0 && (
        <MetricSection title="Dependencias" id="koral-tool-dependencies">
          <ul className="grid gap-3 md:grid-cols-2">
            {data.dependencies.map((dependency) => (
              <li key={`${dependency.domain}-${dependency.requiredContract}`} className="rounded-2xl border border-border-soft bg-white p-4 shadow-e1">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{dependency.domain}</strong><Badge variant="neutral">{dependency.status}</Badge></div>
                <p className="mt-2 text-sm text-text-muted">{dependency.reason}</p>
                <p className="mt-2 break-all text-xs text-text-muted">Contrato requerido: {dependency.requiredContract}</p>
              </li>
            ))}
          </ul>
        </MetricSection>
      )}
      {data.tools.length === 0 ? (
        <EmptyState title="No hay herramientas gobernadas" description="El backend no reportó herramientas para el catálogo de solo lectura." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
          <table className="min-w-[64rem] w-full text-left text-sm">
            <caption className="sr-only">Catálogo gobernado de herramientas de Koral</caption>
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-text-muted"><tr><ColumnHeader>Herramienta</ColumnHeader><ColumnHeader>Estado</ColumnHeader><ColumnHeader>Permiso</ColumnHeader><ColumnHeader>Identidad</ColumnHeader><ColumnHeader>Datos</ColumnHeader><ColumnHeader>Ejecución</ColumnHeader></tr></thead>
            <tbody className="divide-y divide-border-soft">{data.tools.map((tool) => <tr key={`${tool.name}-${tool.version}`}><RowHeader>{tool.name}<span className="block text-xs text-text-muted">v{tool.version}</span><span className="mt-1 block max-w-xs text-xs text-text-muted">{tool.description}</span><details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Esquemas sanitizados</summary><SanitizedJson label="Entrada" value={tool.inputSchema} /><SanitizedJson label="Salida" value={tool.outputSchema} /></details></RowHeader><Cell><Badge variant="neutral">{tool.status}</Badge><span className="mt-1 block text-xs">Mutación: {yesNo(tool.mutation)}</span></Cell><Cell>{tool.permission}<span className="block text-xs text-text-muted">{tool.purpose}</span></Cell><Cell>{tool.minimumIdentityLevel}<span className="block text-xs">Confirmación: {yesNo(tool.confirmationRequired)}</span></Cell><Cell>{tool.dataClassification}</Cell><Cell><StatusBadge tone="inactive" label={tool.runtimeExecutable ? "Ejecutable" : "No ejecutable"} /><span className="mt-1 block text-xs text-text-muted">{tool.applicationServiceMethod}</span></Cell></tr>)}</tbody>
          </table>
        </div>
      )}
      <GeneratedAt value={data.generatedAt} />
    </div>
  );
}

function AutomationsContent({ data }: { data: KoralAutomationsResponse }) {
  return (
    <div className="space-y-6">
      <FactGrid>
        <Fact term="Propietario" value={data.owner} />
        <Fact term="Integración con Koral" value={data.koralIntegration} />
        <Fact term="Desde" value={formatDateTime(data.window.from)} />
        <Fact term="Hasta" value={formatDateTime(data.window.to)} />
      </FactGrid>
      <div className="grid gap-6 lg:grid-cols-2">
        <CountBreakdown title="Definiciones" total={data.definitions.total} values={data.definitions.byStatus} empty="No hay definiciones en la ventana observada." />
        <CountBreakdown title="Ejecuciones" total={data.executions.total} values={data.executions.byStatus} empty="No hay ejecuciones en la ventana observada." />
      </div>
      <MetricSection title="Definiciones observadas" id="koral-automation-definitions">
        {data.definitions.items.length === 0 ? (
          <EmptyState title="Sin definiciones" description="No hay definiciones disponibles en la fuente canónica." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.definitions.items.map((definition) => {
              const version = definition.currentVersion ?? definition.latestVersion;
              return <article key={definition.id} className="rounded-2xl border border-border-soft bg-white p-5 shadow-e1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-text-main">{definition.name}</h3><p className="text-xs text-text-muted">{definition.key}</p></div><Badge variant="neutral">{definition.status}</Badge></div>{version ? <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Versión {version.version} · {version.status}</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><Fact term="Trigger" value={version.triggerType} /><Fact term="Creada" value={formatDateTime(version.createdAt)} /><Fact term="Publicada" value={version.publishedAt ? formatDateTime(version.publishedAt) : "UNKNOWN"} /><Fact term="Revisada por" value={version.reviewedBy ?? "UNKNOWN"} /></dl><SanitizedJson label="Trigger sanitizado" value={version.trigger} /><SanitizedJson label="Condiciones sanitizadas" value={version.conditions} /><SanitizedJson label="Acciones sanitizadas" value={version.actions} /><SanitizedJson label="Política de ejecución sanitizada" value={version.executionPolicy} /></details> : <p className="mt-4 text-sm text-text-muted">No hay versión disponible.</p>}</article>;
            })}
          </div>
        )}
      </MetricSection>
      <MetricSection title="Ejecuciones recientes" id="koral-automation-executions">
        {data.executions.items.length === 0 ? (
          <EmptyState title="Sin ejecuciones recientes" description="No se reportaron ejecuciones en la ventana observada." />
        ) : (
          <div className="space-y-3">
            {data.executions.items.map((execution) => <article key={execution.id} className="rounded-2xl border border-border-soft bg-white p-5 shadow-e1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{execution.automationKey} · v{execution.automationVersion}</h3><p className="text-xs text-text-muted">{execution.mode} · {formatDateTime(execution.createdAt)}</p></div><Badge variant="neutral">{execution.status}</Badge></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Fact term="Trigger" value={execution.triggerReference} /><Fact term="Correlación" value={execution.correlationId} /><Fact term="Fallo" value={execution.failureCode ?? "Ninguno"} /><Fact term="Reintentable" value={nullableBoolean(execution.failureRetryable)} /></dl><details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Pasos ({execution.steps.length})</summary>{execution.steps.length === 0 ? <p className="mt-2 text-sm text-text-muted">Sin pasos reportados.</p> : <ol className="mt-3 space-y-2">{execution.steps.map((step) => <li key={step.id} className="rounded-xl bg-surface-muted p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{step.actionIndex + 1}. {step.actionType}</strong><Badge variant="neutral">{step.status}</Badge></div><p className="mt-1 text-xs text-text-muted">Intentos: {step.attemptCount} · Reintentos registrados: {step.retries.length} · Próximo intento: {step.nextAttemptAt ? formatDateTime(step.nextAttemptAt) : "No programado"}</p>{step.deadLetter && <p className="mt-2 text-xs text-danger">Dead letter: {step.deadLetter.reasonCode} · {step.deadLetter.resolution}</p>}</li>)}</ol>}</details>{execution.deadLetter && <Alert className="mt-4" variant="warning" title="Dead letter de ejecución">{execution.deadLetter.reasonCode} · {execution.deadLetter.resolution} · {execution.deadLetter.retryCount} reintento(s)</Alert>}</article>)}
          </div>
        )}
      </MetricSection>
      <MetricGrid><Metric label="Dead letters sin resolver" value={data.executions.unresolvedDeadLetters} /><Metric label="Ventana observada (horas)" value={data.window.hours} /></MetricGrid>
      <FactGrid>
        <Fact term="Acciones soportadas" value={joinOrUnknown(data.supportedRuntimeActions)} />
        <Fact term="Acciones no soportadas" value={joinOrUnknown(data.unsupportedDefinitionActions)} />
      </FactGrid>
      <GeneratedAt value={data.generatedAt} />
    </div>
  );
}

function AnalyticsContent({ data }: { data: KoralAnalyticsResponse }) {
  const noActivity = data.conversations.total === 0 && data.events.total === 0 && data.processing.total === 0 && data.knowledgeRetrieval.total === 0 && data.automations.executions.total === 0;
  return (
    <div className="space-y-6">
      <FactGrid><Fact term="Desde" value={formatDateTime(data.window.from)} /><Fact term="Hasta" value={formatDateTime(data.window.to)} /><Fact term="Ventana" value={`${data.window.hours} horas`} /></FactGrid>
      {noActivity && <EmptyState title="Sin actividad en la ventana" description="El backend no reportó conversaciones, eventos ni procesamiento para este periodo." />}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <CountBreakdown title="Conversaciones" total={data.conversations.total} values={data.conversations.byStatus} empty="Sin conversaciones." />
        <CountBreakdown title="Eventos" total={data.events.total} values={data.events.byType} empty="Sin eventos." />
        <CountBreakdown title="Procesamiento" total={data.processing.total} values={data.processing.byStatus} empty="Sin procesamiento." />
        <CountBreakdown title="Fallos de procesamiento" total={sumCounts(data.processing.failuresByCode)} values={data.processing.failuresByCode} empty="Sin fallos de procesamiento." />
        <CountBreakdown title="Retrieval de conocimiento" total={data.knowledgeRetrieval.total} values={data.knowledgeRetrieval.byResult} empty="Sin retrieval de conocimiento." />
        <CountBreakdown title="Ejecuciones de automatización" total={data.automations.executions.total} values={data.automations.executions.byStatus} empty="Sin ejecuciones de automatización." />
      </div>
      <MetricGrid><Metric label="Dead letters sin resolver" value={data.automations.unresolvedDeadLetters} /></MetricGrid>
      <FactGrid><Fact term="Latencia media de procesamiento" value={data.processing.latencyMs ? `${data.processing.latencyMs.average} ms` : "UNKNOWN"} /><Fact term="Latencia p95 de procesamiento" value={data.processing.latencyMs ? `${data.processing.latencyMs.p95} ms` : "UNKNOWN"} /></FactGrid>
      <MetricSection title="Cobertura de telemetría" id="koral-telemetry-coverage">
        <FactGrid>
          <Fact term="Registro de uso IA" value={data.telemetry.aiUsage} />
          <Fact term="Persistencia durable de invocaciones" value={yesNo(data.telemetry.durableAiInvocationStore)} />
          <Fact term="Persistencia durable de costo/tokens" value={yesNo(data.telemetry.durableTokenCostStore)} />
          <Fact term="Contenido de prompts registrado" value={yesNo(data.telemetry.promptContentRecorded)} />
        </FactGrid>
      </MetricSection>
      <GeneratedAt value={data.generatedAt} />
    </div>
  );
}

function RuntimeBanner({ status, generatedAt }: { status: KoralRuntimeStatus; generatedAt: string }) {
  const presentation: Record<KoralRuntimeStatus, { label: string; tone: StatusTone; variant: "success" | "warning" | "danger" }> = {
    CONFIGURED: { label: "Configurado", tone: "success", variant: "success" },
    DISABLED: { label: "Deshabilitado", tone: "inactive", variant: "warning" },
    MISCONFIGURED: { label: "Configuración inválida", tone: "failed", variant: "danger" },
  };
  const current = presentation[status];
  return <Alert variant={current.variant} title="Disponibilidad funcional de Koral"><div className="flex flex-wrap items-center justify-between gap-3"><span>Estado observado a las {formatDateTime(generatedAt)}.</span><StatusBadge tone={current.tone} label={current.label} /></div></Alert>;
}

function MetricSection({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="space-y-3"><h2 id={id} className="font-display text-lg font-semibold text-text-main">{title}</h2>{children}</section>;
}
function MetricGrid({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>; }
function Metric({ label, value }: { label: string; value: number | string }) { return <div className="min-h-24 rounded-2xl border border-border-soft bg-white p-4 shadow-e1"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className="mt-3 font-display text-2xl font-semibold tabular-nums text-text-main">{typeof value === "number" ? formatNumber(value) : value}</p></div>; }
function FactGrid({ children }: { children: ReactNode }) { return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>; }
function Fact({ term, value }: { term: string; value: string }) { return <div className="rounded-2xl border border-border-soft bg-white p-4 shadow-e1"><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{term}</dt><dd className="mt-2 break-words text-sm font-medium text-text-main">{value || "UNKNOWN"}</dd></div>; }
function CountBreakdown({ title, total, values, empty }: { title: string; total: number; values: Record<string, number>; empty: string }) { const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right)); return <section aria-label={title} className="rounded-2xl border border-border-soft bg-white p-5 shadow-e1"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">{title}</h2><Badge variant="neutral">Total {formatNumber(total)}</Badge></div>{entries.length === 0 ? <p className="mt-4 text-sm text-text-muted">{empty}</p> : <dl className="mt-4 space-y-2">{entries.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-t border-border-soft pt-2"><dt className="break-all text-sm text-text-muted">{label}</dt><dd className="font-semibold tabular-nums">{formatNumber(value)}</dd></div>)}</dl>}</section>; }
function GeneratedAt({ value }: { value: string }) { return <p className="text-right text-xs text-text-muted">Datos generados: {formatDateTime(value)}</p>; }
function SanitizedJson({ label, value }: { label: string; value: unknown }) { return <details className="mt-3 rounded-xl bg-surface-muted p-3"><summary className="cursor-pointer text-xs font-semibold">{label}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(value, null, 2)}</pre></details>; }
function ColumnHeader({ children }: { children: ReactNode }) { return <th scope="col" className="px-4 py-3 font-semibold">{children}</th>; }
function RowHeader({ children }: { children: ReactNode }) { return <th scope="row" className="px-4 py-4 align-top font-normal">{children}</th>; }
function Cell({ children }: { children: ReactNode }) { return <td className="px-4 py-4 align-top">{children}</td>; }
function yesNo(value: boolean): string { return value ? "Sí" : "No"; }
function nullableBoolean(value: boolean | null): string { return value === null ? "UNKNOWN" : yesNo(value); }
function joinOrUnknown(values: readonly string[]): string { return values.length > 0 ? values.join(", ") : "UNKNOWN"; }
function formatNumber(value: number): string { return value.toLocaleString("es-CO"); }
function sumCounts(values: Record<string, number>): number { return Object.values(values).reduce((sum, value) => sum + value, 0); }
function formatDateTime(value: string): string { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "UNKNOWN" : parsed.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }); }
