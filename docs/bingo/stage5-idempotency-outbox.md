# ETAPA 5: idempotencia, auditoría y outbox

## Alcance

Esta capa contiene adaptadores Prisma que **solo** aceptan el
`Prisma.TransactionClient` del comando Bingo. No abren transacciones propias,
no publican Redis/SSE y no serializan modelos Prisma completos.

## Idempotencia

La identidad de un comando es:

```text
actorUserId + scope + operation + SHA-256(idempotency-key)
```

La clave original nunca se persiste. El request se canonicaliza con la misma
implementación RFC 8785/JCS auditada por fairness y se separa criptográficamente
del hash de la clave mediante prefijos de dominio distintos.

Invariantes:

- una clave válida contiene 16–200 caracteres del alfabeto permitido;
- `scope` identifica un UUID de evento, ronda, ejecución, candidato o ganador;
- misma identidad + mismo request devuelve el resultado persistido;
- misma identidad + request diferente falla con
  `BINGO_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST`;
- `FAILED_RETRYABLE` puede volver atómicamente a `PROCESSING`;
- los resultados persistidos usan una allowlist versionada sin PII;
- un advisory transaction lock derivado de la identidad completa permite una
  única adquisición; `pg_try_advisory_xact_lock` hace que competidores reciban
  `IN_PROGRESS` + `retryAfterMs=250`, sin espera ilimitada;
- el índice único PostgreSQL sigue siendo la defensa definitiva contra
  duplicación aun ante una colisión teórica del advisory lock.

`PROCESSING` debe crearse dentro de la misma transacción del comando. Un crash
antes del commit elimina tanto el registro como los cambios de dominio. No se
usa un mutex en memoria y funciona entre procesos/réplicas.

## Outbox

Catálogo v1:

- `bingo.execution.started.v1`
- `bingo.execution.paused.v1`
- `bingo.execution.resumed.v1`
- `bingo.execution.cancelled.v1`
- `bingo.execution.completed.v1`
- `bingo.execution.restarted.v1`
- `bingo.draw.created.v1`
- `bingo.candidate.detected.v1`
- `bingo.candidate.validated.v1`
- `bingo.candidate.rejected.v1`
- `bingo.winner.confirmed.v1`

Cada tipo tiene un payload cerrado. Se rechazan propiedades adicionales, por lo
que documentos, teléfonos, correos, `subjectRef` y seeds no reveladas no pueden
entrar accidentalmente. Los eventos de ejecución pueden incorporar
`configurationHash` y `fairnessProtocolVersion`; nunca la seed.

El repositorio no calcula `MAX(sequence)+1`. Recibe la secuencia asignada por el
transaction kernel mientras este mantiene el lock canónico del evento. La fila
outbox se inserta con el cambio de dominio y la auditoría antes del único commit.
El reader preparado solo devuelve filas `PENDING`/`FAILED` elegibles; el publisher
y sus transiciones corresponden a ETAPA 9.

## Auditoría

`BingoAuditEvent` es append-only por trigger PostgreSQL. El adaptador impone
catálogos de acción/permisos y allowlists de estado/metadata antes del insert.
IP y user-agent solo se aceptan como SHA-256; el controller futuro calculará esos
valores desde contexto confiable.

Fronteras:

1. **Cambio confirmado:** estado, auditoría `SUCCEEDED` y outbox viven en una
   transacción. Si hay rollback, ninguno sobrevive.
2. **Rechazo de dominio auditable:** puede confirmar una transacción sin cambio
   de dominio que contenga idempotencia final + auditoría `REJECTED` con motivo.
   Nunca se escribe primero un `SUCCEEDED`.
3. **Fallo de infraestructura:** se registra en logging/telemetría operacional
   fuera de la transacción fallida. No se inventa un `BingoAuditEvent` que pueda
   contradecir el rollback. Si posteriormente se requiere evidencia durable de
   intentos fallidos, necesitará un caso de uso explícito con su propia frontera,
   no un side effect oculto.

## Pruebas PostgreSQL

Dos clientes Prisma reales mantienen transacciones concurrentes para demostrar:

- adquisición única y `IN_PROGRESS` no bloqueante;
- replay del resultado tras commit;
- una sola fila idempotente;
- commit conjunto de idempotencia, auditoría y outbox;
- rollback conjunto ante crash simulado antes del commit.

La secuencia outbox y los locks de agregados permanecen bajo responsabilidad del
transaction kernel, no de estos adaptadores.
