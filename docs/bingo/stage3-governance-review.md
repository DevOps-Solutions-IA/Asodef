# Bingo ASODEF — Revisión de governance del modelo físico ETAPA 3

Estado: auditoría final posterior a los commits de schema, integridad, hardening de evidencia y pruebas, sobre `feature/bingo` en `27afb28`. Esta revisión no implementa APIs, motor, importación, realtime ni borrado.

## 1. Alcance inspeccionado

- `apps/api/prisma/schema.prisma` — enums y modelos Bingo.
- `apps/api/prisma/migrations/20260809180000_add_bingo_domain/migration.sql` — tablas, FKs, checks, índices y triggers.
- `apps/api/src/database/bingo-schema-integrity.integration.spec.ts`.
- `apps/api/src/database/bingo-persistence-concurrency.integration.spec.ts`.
- `docs/bingo/domain-data-model.md`.
- `docs/bingo/retention-policy.md`.
- `docs/bingo/commit-reveal-protocol.md`.

## 2. Privacidad e identidad

### Hechos verificados

- `BingoParticipant` es event-scoped y separa identidad de participación.
- Un participante `AFFILIATE` referencia exclusivamente `Affiliate.id`; un participante no afiliado referencia exclusivamente `BingoAuthorizedExternalSubject`. El XOR está reforzado por `bingo_participants_subject_check`.
- `BingoAuthorizedExternalSubject` no contiene nombre, documento, teléfono, email ni subject externo en claro. Conserva `issuer`, `keyId`, `subjectRefFingerprint`, `sourceReferenceHash` opcional y referencias fuertes a `Affiliate`, `Company` o `Customer` cuando corresponden.
- Beneficiarios, miembros de empresa e invitados no crean automáticamente `Affiliate`, `Customer` ni `User`.
- Las FKs usan `RESTRICT`, y las referencias compuestas mantienen el aislamiento del evento/tipo.
- `BingoImportRow.normalizedPayloadEncrypted` prepara staging cifrado; no existe una columna de documento/teléfono en claro.
- Auditoría guarda `ipHash` y `userAgentHash`, no IP/user-agent en claro.

### Riesgos que requieren controles de aplicación

- `BingoWinner.publicDisplaySnapshot`, `BingoOutboxEvent.publicPayload`, `BingoCommandIdempotency.responseBody`, estados de auditoría/`metadata`, parámetros de elegibilidad y contexto son JSON. PostgreSQL no puede imponer una allowlist de PII; cada productor debe usar schema versionado y DTO específico.
- `BingoImportBatch.originalFilename` puede contener PII suministrada por el usuario. Debe reducirse a basename sanitizado y longitud acotada, no participar en `storageReference`, no registrarse en logs públicos y quedar bajo retención de importación.
- `issuer`, `source`, `reason`, `lastError` y nombres administrativos son texto libre. Requieren límites de longitud, normalización y logging seguro en la capa futura.
- El cifrado de `normalizedPayloadEncrypted` todavía no define algoritmo/key-id en columnas. El envelope debe ser autenticado/autodescriptivo y rotatable antes de implementar importación.

Dictamen de privacidad: **apto como modelo expand-only**, condicionado a allowlists, cifrado versionado y tests de ausencia de PII antes de exponer cualquier API/outbox/import funcional.

## 3. Retención

### Hechos verificados

- `BingoRetentionCategory` separa `TEMPORARY_FILE`, `ORIGINAL_IMPORT`, `IMPORT_STAGING`, `PARTICIPATION`, `CARD`, `ASSIGNMENT`, `ROUND_EXECUTION`, `DRAW`, `CANDIDATE`, `WINNER`, `AUDIT` y `CRYPTOGRAPHIC_EVIDENCE`.
- `BingoRetentionPolicy` es única por evento/categoría y conserva configuración solicitada, mínimo corporativo, efectivo, hold, actor y timestamps.
- `bingo_retention_policies_days_check` garantiza que el periodo efectivo no sea menor al configurado ni al mínimo corporativo.
- Los artefactos principales contienen `retentionUntil` y `legalHoldAt`; la política contiene `legalHold` por categoría.
- No existe job de borrado en ETAPA 3.
- Todas las relaciones críticas usan `RESTRICT`. Assignments, executions, win groups, candidates, winners y fairness rechazan `DELETE`; draws y auditoría son append-only.

### Gaps

- `BingoRetentionPolicy` es mutable y no versionada. La historia solo será reconstruible si toda modificación escribe `BingoAuditEvent` de forma atómica. Una columna de versión o tabla histórica sería un hardening mantenible antes de habilitar acciones de retención.
- Los campos `legalHoldAt` no conservan actor, razón ni liberación por sí mismos. El servicio futuro debe registrar cada transición en auditoría append-only y evaluar hold de política OR hold individual.
- `retentionUntil` es nullable. La interpretación obligatoria es fail-closed: NULL significa no configurado/conservar, nunca vencido.
- No se probaron todavía acciones de disposición, concurrencia hold/disposición ni backups/PITR; correctamente están fuera de esta etapa.

Dictamen de retención: **modelo suficiente para configurar y bloquear**, no autorizado para disposición. Mínimos jurídicos/corporativos y operaciones por categoría siguen pendientes.

## 4. Commit-reveal

### Hechos verificados

- `BingoFairnessCommitment` guarda `hashAlgorithm`, `rngAlgorithm`, `protocolVersion`, `canonicalizationVersion`, `configurationHash`, `commitmentHash`, `seedCiphertext`, `custodyKeyId`, actores/timestamps, reveal y evidencia.
- El check exige hash/reveal hash SHA-256 en hexadecimal minúsculo, identificadores no vacíos y campos de reveal completos o todos nulos.
- Commitment, ciphertext, key-id, algoritmos e identidad son inmutables; publicación y reveal son transiciones one-way.
- El reveal solo se admite en una ejecución `COMPLETED` o `CANCELLED`.
- Una ejecución commit-reveal no puede iniciar sin commitment con `publishedAt`.
- El commitment no se puede borrar y tiene retención/hold propios.
- Las pruebas PostgreSQL cubren publicación previa, rechazo de reveal durante ejecución y reveal posterior al cierre.

### Brechas bloqueantes cerradas

1. `bingo_guard_fairness_commitment` exige en INSERT una ejecución `PLANNED`, con `fairnessModeSnapshot = CRYPTO_RNG_COMMIT_REVEAL`, y prohíbe cualquier campo de reveal inicial. Ya no puede fabricarse compromiso retrospectivo ni para modo RNG-only.
2. `configurationHash` y `canonicalizationVersion` son obligatorios, validados e inmutables junto con algoritmos, protocolo, commitment, ciphertext y key-id.
3. La publicación solo puede ocurrir mientras la ejecución sigue `PLANNED`; reveal requiere publicación previa y ejecución `COMPLETED` o `CANCELLED`.

Las pruebas PostgreSQL verifican reveal-on-insert rechazado, inmutabilidad de `configurationHash`, reveal prematuro rechazado, reveal después del cierre aceptado y compromiso retrospectivo rechazado. La selección/generación criptográfica real sigue correctamente fuera de ETAPA 3.

Dictamen commit-reveal: **modelo físico de ETAPA 3 aprobado**. La operación sigue bloqueada hasta implementar y probar custodia, algoritmo determinista, publicación y verificador en sus etapas autorizadas.

## 5. Inmutabilidad de evidencia

### Hechos verificados

- `BingoDraw` y `BingoAuditEvent` son completamente append-only.
- Assignments preservan historial, bloquean delete y congelan campos operativos después del inicio.
- Executions no se borran, validan transiciones y congelan snapshots/actores.
- Win groups, candidates y winners rechazan delete.

### Brecha bloqueante cerrada

`BingoWinGroup` ahora es completamente append-only. `BingoWinnerCandidate` congela identidad, relaciones, máscara/números, balota decisiva, timestamp y hash, y solo permite `PENDING -> VALIDATED|REJECTED`. `BingoWinner` congela identidad, relaciones, política, hash, snapshot público y creación; solo permite `PENDING_VALIDATION -> CONFIRMED|REJECTED`, exige coherencia con el estado del candidato y congela la resolución terminal.

La migración y las pruebas PostgreSQL verifican:

- rechazo de reescritura del hash de win group y candidate;
- rechazo de reescritura del snapshot/hash de winner;
- transiciones legales a estados terminales;
- rechazo de reversión de candidate/winner terminal;
- rechazo de delete sobre todas estas evidencias.

## 6. Imports, outbox e idempotencia

### Hechos verificados

- Import batch conserva SHA-256 único por evento, formato, storage reference, contadores, actores, aprobación, retención y hold.
- Import rows separan payload cifrado, schema version, errores y referencias resueltas; no crean personas.
- Outbox contiene `publicPayload` y no tiene campos de PII explícitos.
- Idempotencia persiste hashes de key/request, no las claves o requests originales.

### Riesgos no bloqueantes para ETAPA 3

- La ausencia de PII en JSON depende de allowlists futuras; debe probarse antes de ETAPA 8/9/13.
- `responseBody` debe contener solo respuesta mínima reproducible o una referencia/hash, no cuerpos completos sensibles.
- `lastError` debe almacenar código/mensaje saneado, sin stack, secreto o fila importada.
- `storageReference` debe ser opaca y generada por servidor; `originalFilename` nunca debe determinar una ruta.
- Retención de outbox/idempotencia necesita categorías/política explícitas antes de jobs, aunque no constituyen fuente de verdad.

## 7. Clasificación consolidada

| Hallazgo                                          | Clasificación                                          | Gate                                                       |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Commitment retrospectivo/RNG-only                 | Cerrado                                                | Trigger fail-closed; publicación/reveal one-way            |
| Winner/candidate/win-group terminal mutable       | Cerrado                                                | Triggers de inmutabilidad y tests PostgreSQL               |
| Hash/versión canónica de configuración            | Cerrado en modelo                                      | `configurationHash` y `canonicalizationVersion` inmutables |
| Política de retención no versionada               | No bloqueante ETAPA 3; bloqueante antes de disposición | Auditoría atómica/versionado                               |
| JSON sin allowlist DB                             | No bloqueante ETAPA 3; bloqueante antes de APIs/outbox | DTO/schema/tests de privacidad                             |
| Filename/payload cifrado sin contrato operacional | No bloqueante ETAPA 3; bloqueante antes de imports     | Sanitización y cifrado versionado                          |
| Mínimos legales/corporativos sin valores          | Esperado/no bloquea schema; bloquea disposición        | Aprobación corporativa/jurídica                            |

## 8. Recomendación

**Dictamen governance: ETAPA 3 puede cerrarse.** El modelo cumple separación de identidad, minimización estructural, retención parametrizable, evidencia inmutable y base de custody verificable. No quedan brechas bloqueantes de governance para el schema expand-only. Los controles de JSON, cifrado operacional, política jurídica y disposición están correctamente clasificados como gates de las futuras superficies funcionales; no autorizan ETAPA 4 ni jobs destructivos.
