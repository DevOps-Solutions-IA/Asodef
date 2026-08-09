# Bingo ASODEF — Protocolo commit-reveal verificable

Estado: contrato criptográfico y operacional para ETAPA 3. No implementa motor, API, UI, Redis ni custodia externa de secretos.

## 1. Propósito y límites

Commit-reveal proporciona evidencia verificable de que la semilla comprometida antes de una ejecución es la misma revelada al cierre. Es configurable por evento; el RNG criptográficamente seguro es obligatorio incluso cuando commit-reveal está deshabilitado.

El protocolo no demuestra por sí solo que un operador no canceló selectivamente una ejecución, que la lista de participantes era correcta o que el software publicado corresponde al algoritmo declarado. Por eso se combina con configuración congelada, PostgreSQL transaccional, secuencia de draws, auditoría, control de reinicios y publicación del compromiso.

PostgreSQL conserva el estado autoritativo y la evidencia pública. Redis, SSE y caches futuros solo distribuyen eventos después del commit.

## 2. Suite criptográfica versionada

La primera suite propuesta para aprobación es:

```text
protocolVersion = "asodef-bingo-commit-reveal-v1"
seedLength       = 32 bytes
seedGenerator    = operating-system CSPRNG
hashAlgorithm    = SHA-256
encoding         = hexadecimal minúsculo para SHA-256; base64url sin padding para seed/ciphertext versionados
canonicalization = JSON Canonicalization Scheme (RFC 8785) o serialización binaria versionada equivalente
```

No se concatena texto ambiguamente. El compromiso se calcula sobre un envelope canónico y domain-separated:

```json
{
  "context": "ASODEF_BINGO_EXECUTION_COMMITMENT",
  "protocolVersion": "asodef-bingo-commit-reveal-v1",
  "eventId": "uuid",
  "roundId": "uuid",
  "executionId": "uuid",
  "revision": 1,
  "configurationHash": "sha256-hex-lowercase",
  "algorithmId": "identificador-versionado-del-shuffle/draw",
  "seed": "base64url-32-bytes"
}
```

```text
commitment = lowercaseHex(SHA-256(canonicalEnvelopeBytes))
```

En el modelo físico, `hashAlgorithm`, `rngAlgorithm` y `protocolVersion` identifican la suite. La versión de canonicalización debe formar parte inequívoca de `protocolVersion`, porque no existe una columna separada. `configurationHash` participa en el envelope, pero el esquema actual no lo persiste como campo independiente; esta carencia queda registrada como hardening previo al motor. Cambiar cualquiera exige nueva ejecución/revisión y nuevo compromiso; nunca se reescribe el anterior.

La forma exacta en que la semilla alimenta el algoritmo de selección pertenece al diseño del motor futuro y deberá evitar sesgo modular. No se considera aprobado un algoritmo por el solo hecho de producir el hash correcto.

## 3. Configuración incluida en el compromiso

`configurationHash` debe cubrir una representación canónica de todo lo que pueda alterar el resultado o su interpretación, como mínimo:

- evento, ronda, execution y revision;
- conjunto/versiones de patrones;
- premios y asociación con rondas;
- política de empate y configuración especial;
- política de validación;
- snapshot/fingerprint del conjunto de cartones habilitados y asignaciones congeladas;
- modalidad 75-ball y regla de centro libre;
- versión del algoritmo de generación/selección/evaluación;
- cualquier fuente de entropía adicional aprobada y su regla de combinación.

No incluye PII. El fingerprint de participantes/cartones usa IDs internos/hashes canónicos y no documentos, teléfonos, correos ni nombres.

## 4. Custody boundary

La semilla sin revelar es un secreto operacional de corta vida. Antes del reveal:

- se genera exclusivamente en backend con CSPRNG del sistema operativo;
- nunca llega al navegador, DTO, log, auditoría genérica, outbox, Redis o SSE;
- nunca se almacena en claro en una columna Prisma ordinaria;
- no se entrega al operador ni al supervisor;
- solo el componente autorizado que ejecutará el motor puede obtenerla;
- backups, crash dumps, traces y métricas no deben exponerla.

ETAPA 3 reserva la evidencia en `BingoFairnessCommitment`: `commitmentHash`, `hashAlgorithm`, `rngAlgorithm`, `protocolVersion`, `seedCiphertext`, `custodyKeyId` y campos de reveal. `seedCiphertext` debe ser un envelope cifrado autenticado y autodescriptivo —algoritmo, versión y nonce/tag—, nunca una seed meramente codificada. Antes de implementar el motor debe elegirse un mecanismo de custodia compatible con la infraestructura real, por ejemplo cifrado envelope con clave dedicada/versionada o un secret manager autorizado. La clave indicada por `custodyKeyId` debe estar separada de claves de sesión, cifrado general e identidad externa.

Si no existe custodia aprobada o la clave no está disponible, crear/iniciar una ejecución commit-reveal falla cerrada. No se degrada silenciosamente a semilla legible ni a modo RNG-only.

## 5. Flujo del protocolo

### 5.1 Preparación

1. Crear `BingoRoundExecution` en estado planificado.
2. Congelar configuración, participantes/cartones aplicables, políticas y versiones.
3. Calcular y persistir `configurationHash`.
4. Generar 32 bytes de semilla con CSPRNG.
5. Construir el envelope canónico y calcular el compromiso.
6. Custodiar la semilla en `seedCiphertext` bajo el boundary restringido y la clave versionada por `custodyKeyId`; la columna existe en PostgreSQL, pero nunca se expone en DTOs, logs, outbox o Redis.
7. Insertar `BingoFairnessCommitment` y evidencia/auditoría en la misma transacción de preparación.

Un retry con la misma idempotency key devuelve la misma ejecución/compromiso; no genera una segunda semilla. Si la transacción falla, no se publica compromiso alguno.

### 5.2 Publicación previa

El compromiso se considera publicado cuando existe evidencia durable, posterior al commit PostgreSQL, que incluye:

- `executionId`, revision y contexto de evento/ronda;
- commitment;
- protocol/hash/algorithm/canonicalization versions;
- `configurationHash`;
- timestamp y secuencia de publicación.

La vista pública futura puede exponer esa allowlist sin PII. El outbox solo lleva el compromiso, nunca la semilla/ciphertext. La ejecución no pasa a `RUNNING` hasta que la publicación requerida por la política tenga estado confirmado o una decisión de cancelación auditable.

### 5.3 Operación

- La semilla permanece no revelada durante `RUNNING` y `PAUSED`.
- Cada draw se escribe transaccionalmente con secuencia única, balota única, algoritmo/versiones y cadena de evidencia.
- No se recalcula ni sustituye el compromiso.
- Redis/SSE no decide resultados ni contiene la semilla.
- Un reinicio crea otra ejecución y otro compromiso independiente.

### 5.4 Cierre y reveal

El reveal solo se permite cuando la ejecución alcanza un estado terminal oficialmente autorizado y la política define revelación:

- `COMPLETED`: reveal obligatorio cuando commit-reveal estaba habilitado.
- `CANCELLED`: reveal o no reveal según la clasificación del fallo, pero la decisión y razón deben quedar registradas; ocultar indefinidamente una seed disponible por conveniencia operacional no es válido.

El cierre debe:

1. bloquear la ejecución;
2. validar estado, secuencia y evidencia;
3. recuperar y descifrar la semilla bajo control autorizado;
4. reconstruir el envelope canónico;
5. verificar el commitment en tiempo constante cuando aplique;
6. persistir seed revelada, timestamp, actor/proceso, resultado y `revealEvidenceHash`;
7. emitir outbox de reveal después del commit;
8. conservar o destruir de forma verificable el ciphertext operacional según la política aprobada, sin afectar la seed ya revelada como evidencia.

Una vez revelada, la seed y metadatos son evidencia inmutable. No se permite “corregir” una seed que no verifica.

## 6. Verificación independiente

El verificador futuro debe recibir una allowlist sin PII:

- envelope público con seed revelada;
- compromiso publicado;
- configuración canónica o su paquete verificable;
- secuencia oficial de draws;
- versiones exactas del protocolo y algoritmo.

Debe comprobar:

1. canonicalización y `configurationHash`;
2. recomputación exacta del compromiso;
3. generación determinista de la secuencia desde seed y algoritmo versionado;
4. igualdad con todos los draws PostgreSQL, en orden;
5. ausencia de balotas duplicadas/omitidas fuera de las reglas;
6. cadena de evidencia y estado terminal.

El resultado es `VERIFIED` o un código de fallo explícito; nunca un booleano silencioso. La herramienta verificadora deberá ser determinista, versionada y testeada con vectores conocidos.

## 7. Cancelación, pausa y restart

### Pausa y reanudación

No cambian seed, compromiso, configuración ni algoritmo. Toda transición conserva actor, razón, requestId, stateVersion y timestamp.

### Cancelación antes de iniciar

- Conserva ejecución, compromiso y razón.
- Si la seed fue generada, se aplica la política aprobada de reveal/custodia para evitar selección oportunista de compromisos.
- Nunca se recicla la seed en otra ejecución.

### Cancelación después de iniciar

- Conserva todos los draws, candidatos y evidencia.
- Debe revelar la seed salvo impedimento técnico real documentado; el resultado se marca cancelado, no válido.
- Si no es posible revelar, se registra `REVEAL_UNAVAILABLE`/equivalente, causa, incidentId y evidencia de custodia. No se fabrica una seed.

### Restart

- Crea nueva `BingoRoundExecution` con revision incremental y relación `previousExecutionId`.
- Genera seed y compromiso nuevos.
- La ejecución anterior queda terminal e inmutable.
- La aprobación de restart y el tratamiento del compromiso anterior se auditan.
- Nunca se borra evidencia para simular que la primera ejecución no existió.

## 8. Fallos y respuestas fail-closed

| Fallo                               | Comportamiento requerido                                                    |
| ----------------------------------- | --------------------------------------------------------------------------- |
| CSPRNG no disponible                | no crear/iniciar ejecución                                                  |
| Custodia/clave no disponible        | no iniciar; no persistir seed en claro                                      |
| Fallo de transacción al comprometer | no publicar; retry idempotente                                              |
| Outbox/publicación pendiente        | no iniciar mientras la publicación previa sea requisito                     |
| `configurationHash` cambia          | cancelar/preparar nueva revisión; no reutilizar compromiso                  |
| Commitment no coincide al reveal    | marcar fallo criptográfico, bloquear validación final y abrir incidente     |
| Seed/ciphertext perdido             | conservar evidencia, marcar reveal no disponible y cancelar/no certificar   |
| Algoritmo/version desconocido       | verificación no soportada; nunca asumir éxito                               |
| Redis/SSE caído                     | estado PostgreSQL sigue válido; publicación se recupera por outbox/snapshot |
| Relojes inconsistentes              | orden autoritativo por secuencia/transaction timestamps; alertar desviación |

Ningún error puede provocar fallback a `Math.random`, semilla predecible, compromiso mutable o reveal anticipado.

## 9. Auditoría mínima

Auditar, sin seed secreta ni ciphertext:

- creación/preparación de ejecución;
- hash/versiones/configurationHash;
- generación y almacenamiento exitoso de custodia, mediante referencia opaca;
- publicación del compromiso;
- inicio, pausa, reanudación, cierre y cancelación;
- solicitud/aprobación de restart;
- intento y resultado de reveal/verificación;
- acceso excepcional a custodia;
- fallos, incidentId y acción correctiva.

Cada evento incluye actor o identidad del proceso, permiso/rol relevante, event/round/execution, estado anterior/nuevo, requestId, idempotency hash, timestamp y resultado. Los logs nunca incluyen seed antes del reveal, claves, nonces de cifrado reutilizables ni payloads con PII.

## 10. Modelo mínimo requerido

El modelo físico `BingoFairnessCommitment` expresa actualmente:

- execution única;
- `protocolVersion`, `hashAlgorithm` y `rngAlgorithm`; canonicalización debe quedar incluida en la versión de protocolo;
- `commitmentHash` hexadecimal minúsculo;
- publicación/reveal mediante `publishedAt`, `revealedSeed`, `revealedByUserId`, `revealedAt` y `revealEvidenceHash`;
- timestamps de commit, publicación y reveal;
- actor/proceso responsable;
- `seedCiphertext` y `custodyKeyId`, nunca expuestos en una superficie pública;
- seed revelada únicamente después del cierre;
- `revealEvidenceHash`, verification status/error;
- clasificación de evidencia, `retentionUntil` y `legalHold` cuando corresponda.

El esquema no tiene `configurationHash`, `canonicalizationVersion`, verification status/error ni una referencia de publicación externa como columnas separadas. Antes de implementar el motor se debe agregar lo estrictamente necesario o documentar un derivado canónico verificable que no dependa de JSON mutable. `seedCiphertext` no debe mezclarse con JSON genérico, outbox ni auditoría.

## 11. Pruebas obligatorias antes de motor/producción

- vectores conocidos de canonicalización, SHA-256 y encoding;
- una modificación en cada campo comprometido cambia el hash;
- reintento idempotente conserva seed/commitment;
- dos ejecuciones obtienen seeds/commitments distintos;
- no existen seed/ciphertext en logs, Redis, outbox o DTOs;
- no puede iniciar sin compromiso publicado cuando el modo está activo;
- no puede revelar durante `PLANNED`, `RUNNING` o `PAUSED`;
- reveal válido reproduce compromiso y secuencia completa;
- seed incorrecta falla y no puede corregirse por update;
- cancelación antes/después de inicio conserva evidencia;
- restart genera revision, seed y commitment nuevos;
- caída de custodia, base, outbox y Redis cumple la matriz fail-closed;
- concurrencia de cierre/reveal produce una única transición;
- verificador independiente reproduce resultados en todas las versiones soportadas;
- retención/hold impide eliminación prematura de compromiso/reveal.

## 12. Decisiones pendientes para la implementación del motor

Aunque el contrato queda definido, antes de ETAPA 5 deben aprobarse:

- mecanismo real de custodia y rotación de su clave dedicada;
- algoritmo determinista exacto de derivación/shuffle sin sesgo;
- política de publicación durable y evidencia externa si se requiere;
- comportamiento corporativo exacto de reveal en cancelaciones pre-start;
- fuente de entropía pública adicional, si se adopta;
- formato del paquete/verificador público y su ciclo de soporte;
- procedimiento de incidentes cuando reveal o verificación falla.

Estas decisiones no bloquean el modelo expand-only de ETAPA 3, pero sí bloquean implementar o habilitar commit-reveal operativo.
