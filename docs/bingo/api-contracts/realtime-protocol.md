# Contrato realtime Bingo v1

Estado: contrato y protocolo preparados. Este cambio **no** registra endpoint
SSE, publisher, suscripción Redis, worker ni configuración productiva.

## Autoridad y topología futura

El flujo autorizado es:

`transacción PostgreSQL + outbox` → `publisher` → `Redis Pub/Sub` →
`procesos API` → `SSE`.

PostgreSQL/outbox es la fuente autoritativa. Redis solo distribuye después del
commit: perder un mensaje Redis nunca cambia el resultado y siempre se recupera
mediante snapshot/replay PostgreSQL. Un evento SSE se proyecta por allowlist; no
se reenvía el JSON outbox ni un modelo Prisma completo.

## Catálogo y versionado

El catálogo realtime mantiene paridad exacta con los once eventos outbox v1:

- lifecycle: `started`, `paused`, `resumed`, `cancelled`, `completed`,
  `restarted`;
- draw: `created`;
- candidate: `detected`, `validated`, `rejected`;
- winner: `confirmed`.

Todos terminan en `.v1`. Agregar campos opcionales compatibles puede conservar
la versión; quitar/cambiar semántica, privacidad o tipo de un campo exige `.v2`
y convivencia explícita durante la transición.

## Envelope, secuencia e identidad

Cada envelope contiene exactamente `id`, `type`, `stream`, `sequence`,
`occurredAt`, `surface` y `data`:

- `id` es el UUID de la fila outbox PostgreSQL;
- `sequence` es la secuencia outbox autoritativa del evento;
- `stream` es un token opaco sin PII ni IDs de Affiliate/User;
- `data.schemaVersion` es `1` y sus demás campos dependen de evento/superficie.

Los streams llevan prefijo `public:`, `affiliate:` o `admin:`. El sufijo debe
ser opaco y no enumerable donde exista autorización. No se usa el ID interno de
un afiliado como nombre de canal Redis/SSE.

## `Last-Event-ID`, deduplicación y replay

SSE transmite el UUID outbox como `id`; el navegador lo reenvía mediante
`Last-Event-ID`. El servidor valida un único UUID y lo resuelve en PostgreSQL
para obtener `stream` y `sequence`. **Nunca confía en una secuencia enviada por
el cliente.** Un cursor inexistente, de otro stream o no autorizado se rechaza
sin revelar si pertenece a otro evento/usuario.

Al consumir envelopes:

- misma secuencia + mismo ID, o secuencia anterior: duplicado, se ignora;
- misma secuencia + ID diferente: conflicto, `RESYNC_REQUIRED`;
- secuencia exactamente siguiente: se aplica;
- gap o stream diferente: `RESYNC_REQUIRED`.

La ventana de replay decide:

- sin cursor: snapshot inicial obligatorio;
- cursor anterior a retención: snapshot/resync;
- cursor futuro o ID terminal inconsistente: snapshot/resync;
- cursor retenido: replay desde `lastSequence + 1`;
- cursor al día: mantener conexión y esperar.

## Snapshot y reconexión

Cada snapshot REST devuelve el estado autoritativo y un cursor con `stream`,
`lastEventId`, `lastSequence`, `generatedAt` y revisión de ejecución. El cliente:

1. obtiene snapshot autorizado;
2. renderiza el estado completo;
3. abre SSE con el cursor;
4. aplica únicamente secuencias contiguas;
5. ante gap, cambio de revisión, desconexión lenta o cursor expirado, descarta
   proyecciones incrementales y vuelve al paso 1.

La reconexión usa backoff exponencial acotado con jitter. Una tormenta de
reconexión no se resuelve con bucles inmediatos. Heartbeats no avanzan la
secuencia. Los clientes lentos usan buffer acotado; al excederlo se desconectan
y recuperan por snapshot, evitando memoria sin límite en API.

## Superficies y autorización continua

- `PUBLIC`: únicamente evento con visibilidad pública y realtime público
  habilitado; no PII, candidates, layout de cartón ni IDs internos.
- `AFFILIATE`: sesión autoservicio vigente, identidad resuelta por el puente
  aprobado y participación actual en ese evento. La ruta no acepta documento,
  teléfono, código ni `subjectRef`.
- `ADMIN`: sesión administrativa vigente y permiso Bingo suficiente para esa
  operación/vista. Candidate events existen únicamente aquí.

Cada conexión se autoriza al abrir y debe expirar/cerrarse conforme a la sesión
vigente. Una revocación no convierte Redis en fuente de autorización: el proceso
API decide qué stream puede observar cada conexión. Nunca se reutiliza un stream
privilegiado para clientes públicos filtrándolo en React.

## Allowlist y privacidad

Las proyecciones poseen allowlist exacta por evento y superficie. El contrato
rechaza campos desconocidos y, recursivamente, documento, teléfono, correo,
dirección, `subjectRef`, `affiliateId`, `participantId`, claves de custodia,
idempotency material y cualquier seed/ciphertext no revelado. Ganadores públicos
solo reciben número de cartón y, cuando la política lo permite, nombre ya
anonimizado.

La revelación commit-reveal será un contrato versionado independiente cuando
exista custodia operacional; nunca se añade `seed` a un draw/evento genérico.

## Fallos y recuperación

| Fallo                    | Comportamiento contractual                             |
| ------------------------ | ------------------------------------------------------ |
| Redis caído              | outbox conserva eventos; snapshot refleja el commit    |
| proceso API reinicia     | cliente reconecta y resuelve cursor en PostgreSQL      |
| evento Pub/Sub duplicado | stream+sequence+id lo deduplican                       |
| evento perdido/gap       | `RESYNC_REQUIRED`, snapshot y replay retenido          |
| cursor expirado          | snapshot completo, sin intentar reconstrucción parcial |
| cliente lento            | desconexión controlada; buffer no crece sin límite     |
| sesión expirada/revocada | cierre/no reconexión hasta reautenticar                |
| cambio de ejecución      | snapshot cambia revisión; no mezcla draws antiguos     |

## Pendiente para implementación ETAPA 9

- publisher outbox con claim/retry/backoff y métricas;
- canales Redis separados por superficie y sin PII;
- endpoint SSE con heartbeat, buffer y límites;
- snapshots reales público/afiliado/admin;
- autorización y cierre por expiración/revocación;
- pruebas multi-proceso, Redis caído, replay, cliente lento y carga 1k–10k.

Nada de lo anterior se presenta como operacional en este cambio de contratos.
