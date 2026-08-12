# ETAPA 3 — Diseño del dominio y modelo de datos de Bingo

Estado: modelo físico de ETAPA 3 implementado y validado en `feature/bingo`. No autoriza ETAPA 4 ni implementa motor, APIs, SSE o frontend.

Diseño conceptual original: `feature/bingo-domain-design` en `310ce18ecf8970ebf1b17c0ee1a72691a8d8ca33`.

Implementación física: `apps/api/prisma/schema.prisma` y migración expand-only `20260809180000_add_bingo_domain`.

## 1. Alcance y lenguaje de certeza

Este documento conserva el razonamiento conceptual que precedió la implementación y registra debajo el resultado físico autoritativo. Las propuestas históricas de las secciones posteriores solo siguen vigentes cuando coinciden con la sección 1.1 y con `schema.prisma`/la migración.

Se usan tres etiquetas:

- **DECISIÓN CERRADA**: requisito ya aprobado por el propietario.
- **RECOMENDACIÓN**: diseño propuesto a partir de la arquitectura real inspeccionada.
- **GATE FUTURO**: decisión operativa o jurídica que no bloquea la estructura de ETAPA 3, pero debe cerrarse antes de habilitar la funcionalidad correspondiente.

### 1.1 Implementación física autoritativa

**HECHO VERIFICADO:** ETAPA 3 materializa 28 modelos y 26 enums Bingo sin alterar destructivamente tablas ASODEF existentes. PostgreSQL aplica checks, claves compuestas, índices parciales, triggers y `RESTRICT` adicionales que Prisma no puede expresar por sí solo.

Agregados y nombres finales:

- Configuración: `BingoEvent`, `BingoEligibilityRule`, `BingoRound`, `BingoPrize`, `BingoPattern`, `BingoPatternMask` y `BingoRoundPattern`.
- Identidad autorizada y participación: `BingoAuthorizedExternalSubject`, `BingoParticipant` y `BingoEligibilityApproval`.
- Operación/evidencia preparada: `BingoRoundExecution`, `BingoExecutionActor`, `BingoFairnessCommitment`, `BingoDraw`, `BingoWinGroup`, `BingoWinnerCandidate`, `BingoWinner` y `BingoTieBreak`.
- Cartones: `BingoCard`, `BingoCardPatternMask` y `BingoCardAssignment`.
- Soporte durable: `BingoCommandIdempotency`, `BingoOutboxEvent`, `BingoImportBatch`, `BingoImportRow`, `BingoImportApplicationChunk`, `BingoAuditEvent` y `BingoRetentionPolicy`.

Las seis decisiones adicionales quedaron cerradas físicamente así:

1. Beneficiarios: Bingo no crea un maestro. `BingoAuthorizedExternalSubject` conserva una referencia verificable event-scoped, enlaza al afiliado titular cuando corresponde y nunca guarda el `subjectRef` en claro.
2. Participantes empresariales/invitados: la misma entidad autorizada conserva `issuer`, `keyId`, fingerprint HMAC y fuente; puede enlazar `Company` y, únicamente si fue resuelto formalmente, `Customer`. No crea `Affiliate`, `Customer`, usuario ni beneficiario.
3. Commit-reveal: `BingoFairnessCommitment` conserva algoritmos/versiones, `commitmentHash`, `configurationHash`, `canonicalizationVersion`, semilla cifrada y key-id de custodia; la semilla revelada solo se admite después del cierre oficial. El protocolo completo vive en `commit-reveal-protocol.md`.
4. Cartones: el benchmark seleccionó `smallint[25]` canónico con centro libre en posición 13 y `bit(75)` derivado/precalculado en `BingoCardPatternMask`. El array permite reconstrucción y constraints; el bitset acelera patrones sin convertirse en segunda fuente de verdad. La evidencia está en `card-representation-benchmark.md`.
5. Retención: `BingoRetentionPolicy` separa configuración, mínimo corporativo y valor efectivo por categoría. Los artefactos relevantes conservan `retentionUntil` y `legalHoldAt`; no existe job de borrado en ETAPA 3. Las duraciones jurídicas concretas siguen siendo un gate de cumplimiento, no una omisión estructural.
6. `CUSTOM_APPROVED` y desempates: `BingoEligibilityApproval` exige fuente, actor, fecha, referencia/razón y contexto; `BingoWinGroup` conserva todos los candidatos simultáneos y `BingoTieBreak` enlaza una ejecución posterior sin borrar el grupo original.

Decisiones conceptuales sustituidas:

- `BingoGuestAuthorization` fue reemplazado por `BingoAuthorizedExternalSubject` más `BingoEligibilityApproval`.
- `BingoIdempotencyRecord` se implementó como `BingoCommandIdempotency`.
- `BingoRetentionRule` se implementó como `BingoRetentionPolicy`.
- No se implementaron `BingoCardNumber` ni `BingoExecutionCardState`: el benchmark descartó la normalización por celda como representación principal. La propiedad histórica usada por un candidato queda anclada mediante su FK compuesta a `BingoCardAssignment`.
- El modelo usa `BingoOutboxEvent`, no una infraestructura realtime; Redis/SSE permanecen fuera de ETAPA 3.

La migración `20260809180000_add_bingo_domain` es expand-only. Crea únicamente tipos, tablas, funciones, constraints, índices y triggers Bingo; no transforma ni elimina datos existentes. Los comandos operativos, transiciones transaccionales, generación RNG y publicación outbox corresponden a etapas posteriores.

## 2. Hechos verificados en ASODEF

- Prisma usa modelos PascalCase y `@@map`/`@map` para tablas y columnas `snake_case`.
- Las PK son UUID; las fechas de dominio usan `DateTime @db.Timestamptz(3)`.
- Los estados finitos y estables se representan con enums PostgreSQL.
- Las entidades financieras, legales, de auditoría e identidad usan `onDelete: Restrict` para preservar evidencia.
- Los checks, índices parciales y constraints que Prisma no expresa se agregan explícitamente en las migraciones SQL.
- `User`, `Role`, `Permission`, `Affiliate`, `Customer`, `Company` y `AffiliateExternalIdentity` ya existen.
- `Affiliate` referencia a `Customer`; no deben duplicarse identidad, documento, teléfono ni autenticación del afiliado.
- Existe `AuditLog`, pero su diseño exige una FK real a un dominio concreto. También existe el precedente aislado `SelfServiceAuditEvent`.
- Existe una política corporativa de retención por categorías, pero el enum actual no incluye categorías Bingo.
- No se encontró un modelo de beneficiario, empleado/persona de empresa o invitado reutilizable y verificable.

## 3. Principios del modelo

1. **DECISIÓN CERRADA:** PostgreSQL es la única fuente de verdad; Redis nunca contiene estado autoritativo.
2. **DECISIÓN CERRADA:** un evento soporta varias rondas y varios premios.
3. **DECISIÓN CERRADA:** identidad de persona y participación en Bingo son conceptos separados.
4. **DECISIÓN CERRADA:** `Affiliate.id` es la referencia del afiliado; el acceso externo se resuelve antes mediante `AffiliateExternalIdentity`.
5. **DECISIÓN CERRADA:** no se borra evidencia para reiniciar, reasignar, invalidar o hacer rollback.
6. **RECOMENDACIÓN:** toda FK de evidencia debe usar `Restrict`; el borrado físico solo debe alcanzar artefactos temporales vencidos.
7. **RECOMENDACIÓN:** la configuración que afecta el resultado se congela mediante snapshots/versiones antes de iniciar la ronda.
8. **RECOMENDACIÓN:** las tablas de operación incorporan `eventId` aun cuando pueda derivarse por joins. Permite FKs compuestas que impiden mezclar eventos y acelera consultas de aislamiento.
9. **RECOMENDACIÓN:** los estados se validan en servicio y con checks SQL; las transiciones críticas se ejecutan bajo lock de ejecución y transacción.
10. **HECHO VERIFICADO:** la migración de ETAPA 3 es expand-only: añade tablas, enums, índices, funciones, triggers y FKs; no transforma datos actuales de ASODEF.

## 4. Mapa de agregados y cardinalidades

```text
BingoEvent 1 ── n BingoRound 1 ── n BingoRoundExecution
     │               │                    │
     │               ├── n BingoPrize     ├── n BingoDraw
     │               └── n BingoRoundPattern       │
     │                                               └── n BingoWinGroup
     ├── n BingoEligibilityRule                              ├── n BingoWinnerCandidate
     ├── n BingoParticipant                                  └── n BingoWinner
     ├── n BingoCard 1 ── n BingoCardAssignment
     ├── n BingoImportBatch ── n BingoImportRow
     ├── n BingoRetentionPolicy
     ├── n BingoAuditEvent
     ├── n BingoCommandIdempotency
     └── n BingoOutboxEvent
```

`BingoParticipant` es una inscripción específica del evento. No es una persona maestra. `BingoCardAssignment` separa la inscripción del cartón y conserva cada reasignación.

## 5. Catálogo de estados y políticas

Esta tabla refleja el catálogo físico implementado. `schema.prisma` continúa siendo la fuente autoritativa.

| Enum implementado             | Valores                                                                                                                                                                           | Finalidad                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `BingoEventStatus`            | `DRAFT`, `CONFIGURED`, `PUBLISHED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `ARCHIVED`                                                                                           | Lifecycle del evento                                                             |
| `BingoEventVisibility`        | `PUBLIC`, `AUTHENTICATED_AFFILIATES`, `AUTHORIZED_PARTICIPANTS`                                                                                                                   | Acceso a `/bingo/:eventSlug`                                                     |
| `BingoParticipantStatus`      | `PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`                                                                                                                                    | Resultado de elegibilidad y admisión                                             |
| `BingoParticipantKind`        | `AFFILIATE`, `BENEFICIARY`, `PARTNER_COMPANY_MEMBER`, `AUTHORIZED_GUEST`                                                                                                          | Fuente de identidad/elegibilidad                                                 |
| `BingoRoundStatus`            | `DRAFT`, `READY`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`                                                                                                                         | Estado lógico de la ronda                                                        |
| `BingoExecutionStatus`        | `PLANNED`, `RUNNING`, `PAUSED`, `COMPLETED`, `CANCELLED`                                                                                                                          | Estado de cada revisión/ejecución                                                |
| `BingoValidationPolicy`       | `SIMPLE`, `DUAL_CONTROL`                                                                                                                                                          | Quién valida ganadores                                                           |
| `BingoTiePolicy`              | `SPLIT_PRIZE`, `FULL_PRIZE_EACH`, `TIE_BREAK`, `PRECONFIGURED_SPECIAL_RULE`                                                                                                       | Resolución preconfigurada de empates                                             |
| `BingoFairnessMode`           | `CRYPTO_RNG`, `CRYPTO_RNG_COMMIT_REVEAL`                                                                                                                                          | Evidencia de imparcialidad                                                       |
| `BingoPublicWinnerVisibility` | `CARD_ONLY`, `PARTIAL_NAME_AND_CARD`                                                                                                                                              | Allowlist pública; el detalle privado se autoriza por permisos, no por este enum |
| `BingoAssignmentStatus`       | `ACTIVE`, `SUPERSEDED`, `REVOKED`                                                                                                                                                 | Historial de asignación                                                          |
| `BingoCandidateStatus`        | `PENDING`, `VALIDATED`, `REJECTED`                                                                                                                                                | Validación de candidatos                                                         |
| `BingoImportStatus`           | `UPLOADED`, `VALIDATING`, `STAGED`, `READY_FOR_APPROVAL`, `APPROVED`, `APPLYING`, `COMPLETED`, `REJECTED`, `FAILED`, `EXPIRED`                                                    | Pipeline de importación                                                          |
| `BingoImportRowStatus`        | `VALID`, `INVALID`, `UNRESOLVED`, `APPLIED`, `SKIPPED`                                                                                                                            | Resultado por fila                                                               |
| `BingoRetentionCategory`      | `TEMPORARY_FILE`, `ORIGINAL_IMPORT`, `IMPORT_STAGING`, `PARTICIPATION`, `CARD`, `ASSIGNMENT`, `ROUND_EXECUTION`, `DRAW`, `CANDIDATE`, `WINNER`, `AUDIT`, `CRYPTOGRAPHIC_EVIDENCE` | Retención por evento/tipo                                                        |

Checks SQL deben impedir combinaciones imposibles de estados y timestamps; no se confiará solo en enums.

## 6. Entidades e invariantes implementadas

### 6.1 `BingoEvent`

Raíz de configuración y aislamiento.

Campos esenciales:

- `id UUID`.
- `slug String`, único global, normalizado en minúsculas y no reutilizable después de publicación.
- `name String`, `description String?` como texto plano seguro.
- `status BingoEventStatus`.
- `visibility BingoEventVisibility`.
- `maxCardsPerParticipant Int`.
- `publicWinnerVisibility BingoPublicWinnerVisibility`.
- `fairnessMode BingoFairnessMode`.
- `configurationVersion Int`, inicia en 1.
- `scheduledStartAt`, `publishedAt`, `configurationLockedAt`, `startedAt`, `completedAt`, `cancelledAt` opcionales.
- `createdByUserId`, `updatedByUserId`, `createdAt`, `updatedAt`.

Invariantes:

- `maxCardsPerParticipant BETWEEN 1 AND límite_corporativo`.
- `PUBLISHED` o posterior exige `publishedAt`, reglas de elegibilidad, retención y al menos una ronda lista.
- `IN_PROGRESS` exige `configurationLockedAt` y `startedAt`.
- La visibilidad no otorga participación; la elegibilidad siempre la decide backend.
- Cambios posteriores al lock solo pueden ser metadatos no operativos. Una modificación material exige nueva versión/evento según la clase del cambio.

Índices:

- `UNIQUE (slug)`.
- `(status, scheduled_start_at)` para operación.
- parcial `(scheduled_start_at) WHERE status IN ('PUBLISHED','IN_PROGRESS')` para eventos visibles/activos.

### 6.2 `BingoEligibilityRule`

Reglas combinables y versionadas del evento.

Campos:

- `id`, `eventId`, `kind`, `enabled`.
- `parameters Json` para parámetros pequeños con DTO/versionado estricto, nunca código ejecutable ni PII.
- `version`, `lockedAt?`, `createdByUserId`, `createdAt`.

Invariantes:

- Los vínculos concretos a empresa o afiliado titular pertenecen al sujeto externo autorizado, no a la regla reusable.
- Las reglas usadas no se editan: se crea una versión y se congela al publicar.
- La elegibilidad observada se registra después en la participación como evidencia mínima, no como copia de datos personales.
- Índice `(event_id, enabled, kind)` y unicidad `(event_id, kind, version)`.

**DECISIÓN FÍSICA CERRADA:** la resolución usa `BingoAuthorizedExternalSubject` y exige una fuente verificable. La integración con un adaptador real de `ExternalCoreProvider` es un gate funcional posterior; si el proveedor no está disponible, la resolución falla cerrada y no fabrica identidades.

### 6.3 `BingoAuthorizedExternalSubject`

Referencia event-scoped para beneficiarios, miembros de empresas aliadas e invitados cuya identidad maestra vive fuera de Bingo. Sustituye la propuesta conceptual `BingoGuestAuthorization`.

Campos:

- `id`, `eventId`, `kind`, `issuer`, `keyId`, `subjectRefFingerprint`.
- `sourceReferenceHash?` como evidencia minimizada de la autorización.
- `ownerAffiliateId?`, `companyId?`, `linkedCustomerId?` cuando la fuente oficial resolvió formalmente esas relaciones.
- `resolvedByUserId?`, `verifiedAt`, `lastVerifiedAt`, `revokedAt?`, `createdAt`.

Invariantes:

- `UNIQUE (event_id, issuer, key_id, subject_ref_fingerprint)` evita duplicar la misma identidad autorizada dentro del evento.
- La FK compuesta `(id, event_id, kind)` obliga al participante a conservar evento y clase de sujeto.
- No almacena `subjectRef` en claro, documento, teléfono, correo ni una copia libre de PII.
- `BENEFICIARY` exige afiliado titular; `PARTNER_COMPANY_MEMBER` exige empresa; los checks SQL rechazan combinaciones incompatibles.
- Revocar conserva la fila y bloquea su uso futuro; no crea ni modifica automáticamente `Affiliate`, `Customer`, beneficiarios o usuarios.

### 6.4 `BingoParticipant`

Participación event-scoped separada de la identidad.

Campos:

- `id`, `eventId`, `kind`, `status`.
- `affiliateId?` FK a `Affiliate`.
- `externalSubjectId?` FK compuesta a `BingoAuthorizedExternalSubject` para cualquier sujeto no afiliado.
- `approvedAt?`, `rejectedAt?`, `withdrawnAt?`, `reason?`.
- `retentionUntil?`, `legalHoldAt?`, `createdAt`, `updatedAt`.

La regla, fuente, actor, contexto y decisión de elegibilidad no se duplican en esta fila: se preservan en `BingoEligibilityApproval`. El vínculo opcional a `Customer`, cuando una fuente autorizada lo resuelve formalmente, pertenece a `BingoAuthorizedExternalSubject`.

Invariantes:

- Check XOR: exactamente una referencia de sujeto según `kind`.
- `AFFILIATE` exige `affiliateId` y prohíbe las otras referencias.
- Invitado/miembro de empresa exige autorización; conocer la URL nunca basta.
- `APPROVED` exige elegibilidad verificada y actor/fecha de aprobación cuando corresponda.
- Un sujeto solo tiene una participación por evento. Se requieren índices únicos parciales por cada tipo porque los NULL no expresan el XOR por sí solos.
- Las consultas de autoservicio siempre filtran por `eventId` y por el `Affiliate.id` resuelto desde sesión.

Índices:

- único parcial `(event_id, affiliate_id) WHERE affiliate_id IS NOT NULL`.
- unicidad referencial de `externalSubjectId` y FK compuesta `(externalSubjectId, eventId, kind)`.
- `(event_id, status, id)` para listados estables y aplicación por lotes.

### 6.5 `BingoRound`

Unidad de juego/configuración dentro del evento.

Campos:

- `id`, `eventId`, `sequence Int`, `name`, `status`.
- `validationPolicy BingoValidationPolicy`.
- `tiePolicy BingoTiePolicy` y `tiePolicyConfiguration Json?`.
- `configurationVersion`, `configurationLockedAt?`.
- No persiste `currentExecutionId`; la revisión vigente se deriva del lifecycle protegido por índice parcial.
- `createdByUserId`, `createdAt`, `updatedAt`.

Invariantes:

- `UNIQUE (event_id, sequence)` y `UNIQUE (id, event_id)` para FKs compuestas.
- La política de empate, validación y patrones se bloquea antes de `READY`/inicio.
- `PRECONFIGURED_SPECIAL_RULE` exige configuración validada y texto de política aprobado antes de iniciar.
- La ejecución vigente se determina por lifecycle; un índice parcial impide dos ejecuciones `RUNNING`/`PAUSED` para la misma ronda. No se implementó un puntero mutable `currentExecutionId`.

### 6.6 `BingoPrize`

Campos:

- `id`, `eventId`, `roundId`, `sequence`, `name`, `description?`.
- `amountMinor?` y `currency?` si es monetario; nunca decimal flotante.
- `quantity`, `metadata Json?` con schema/allowlist.
- `createdAt`.

Invariantes:

- Una ronda tiene uno o varios premios; un evento de una sola ronda sigue el mismo modelo.
- `UNIQUE (round_id, sequence)`.
- FK compuesta `(round_id, event_id)` evita premios cruzados.
- Premio no se modifica después del lock de ronda.

### 6.7 `BingoPattern` y `BingoPatternMask`

Definición inmutable y versionada de modalidad.

`BingoPattern` contiene `id`, `eventId`, `code`, `name`, `kind`, `version`, `requiredMatchCount`, `createdAt`. La implementación inicial mantiene incluso los patrones estándar dentro del evento para reforzar aislamiento y congelamiento.

`BingoPatternMask` contiene `patternId`, `sequence`, `positionMask Int` (25 bits; el centro libre se considera marcado) y `createdAt`.

`BingoRoundPattern` vincula ronda/patrón y congela la versión usada.

Invariantes:

- Soporte mínimo: línea, dos líneas, cuatro esquinas, cartón lleno y patrones configurables.
- `positionMask > 0` y no usa bits fuera de la cuadrícula 5x5.
- `UNIQUE (pattern_id, sequence)` y `UNIQUE (round_id, pattern_id)`.
- `requiredMatchCount=2` expresa dos líneas sin ocultar cuáles se completaron.
- Un patrón utilizado no se actualiza; se crea nueva versión.

### 6.8 `BingoCard`

Cartón canónico perteneciente al evento.

Campos:

- `id`, `eventId`, `displayNumber` (identificador público no autenticador).
- `numbers Int[] @db.SmallInt` con exactamente 25 posiciones; el centro libre se representa canónicamente como `0` en la posición 13.
- `layoutHash` SHA-256 de la representación canónica.
- `generationVersion`, `createdAt`.

Invariantes:

- 75 balotas, columnas B 1–15, I 16–30, N 31–45, G 46–60, O 61–75; centro libre.
- Sin números repetidos dentro del cartón.
- `UNIQUE (event_id, display_number)` y `UNIQUE (event_id, layout_hash)`.
- `displayNumber` nunca autentica una consulta y no debe ser un secreto enumerable usado solo.
- Validación de longitud, centro, rangos por columna y unicidad mediante la función PostgreSQL inmutable `bingo_valid_card` y un `CHECK` de tabla.

**RECOMENDACIÓN DE ESCALA:** mantener la representación compacta en una fila y precalcular masks. No recorrer matrices React ni deserializar 50.000 matrices completas por comando.

### 6.9 Propuestas de evaluación sustituidas por el benchmark

Antes del benchmark se evaluaron estas estructuras:

- `BingoCardNumber(eventId, cardId, ballNumber, cellBit)`, 24 filas por cartón, con PK `(card_id, ball_number)` e índice `(event_id, ball_number, card_id)`. Permite localizar solo cartones afectados por la balota.
- `BingoExecutionCardState(executionId, cardId, participantId, markedMask BigInt, version Int)`, con PK `(execution_id, card_id)` e índice `(execution_id, participant_id)`.

La normalización por celda implicaba 1,2 millones de filas para 50.000 cartones. La medición demostró que no debía ser la representación principal.

**DECISIÓN FÍSICA CERRADA:** `BingoCard.numbers` es el array canónico `smallint[25]`; `BingoCardPatternMask.requiredNumbers` conserva máscaras `bit(75)` derivadas y verificables por cartón/patrón. No se crearon `BingoCardNumber` ni `BingoExecutionCardState`. La FK compuesta del candidato hacia `BingoCardAssignment` conserva la asignación histórica exacta usada como evidencia.

### 6.10 `BingoCardAssignment`

Historial inmutable de asignación/reasignación.

Campos:

- `id`, `eventId`, `cardId`, `participantId`.
- `status`, `assignedAt`, `deactivatedAt?`.
- `supersededByAssignmentId?`.
- `actorUserId`, `reason`, `requestId`, `idempotencyRecordId?`.
- `roundContextId?` para documentar la ronda que congela/condiciona el cambio.

Invariantes:

- Única asignación `ACTIVE` por `(event_id, card_id)` mediante índice parcial.
- Reasignar crea una nueva fila y cambia la anterior a `SUPERSEDED`; nunca hace `DELETE` ni sobrescribe participante.
- La sucesora debe compartir `eventId` y `cardId`, garantizado con FK compuesta.
- El conteo de asignaciones activas de un participante no puede superar `event.maxCardsPerParticipant`; se garantiza bajo lock del participante/evento y transacción. Un trigger diferible es opcional si el benchmark demuestra que no penaliza importaciones.
- No hay reasignación después de que una ejecución aplicable quede `RUNNING`; el candidato referencia la asignación histórica exacta mediante `assignmentId` y FK compuesta.
- Actor, timestamp, motivo, evento, contexto y requestId son obligatorios.

Índices:

- parcial único `(event_id, card_id) WHERE status='ACTIVE'`.
- `(event_id, participant_id, status)` para límite/listado.
- único `(event_id, card_id, id)` como objetivo de FKs compuestas de sucesión.

### 6.11 `BingoRoundExecution`

Una revisión operacional de la ronda. “Reiniciar” crea una nueva fila.

Campos:

- `id`, `eventId`, `roundId`, `revision Int`, `previousExecutionId?`.
- `status`, `stateVersion BigInt`.
- `operatorUserId?`, `startedAt?`, `pausedAt?`, `completedAt?`, `cancelledAt?`, `cancelReason?`.
- snapshot de `validationPolicy`, `tiePolicy`, `fairnessMode`, `configurationVersion`.
- `createdByUserId`, `createdAt`.

Invariantes:

- `UNIQUE (round_id, revision)`.
- FK compuesta asegura que anterior/nueva ejecución pertenecen a la misma ronda y evento.
- Máximo una ejecución en `RUNNING` o `PAUSED` por ronda mediante índice único parcial.
- `CANCELLED` exige fecha, actor/motivo y conserva draws/candidatos.
- `stateVersion` crece en cada comando crítico y soporta optimistic checks además de `FOR UPDATE`.
- Nunca se reutiliza una ejecución cancelada.

### 6.12 `BingoFairnessCommitment`

Evidencia de commit-reveal cuando el evento lo habilita.

Campos:

- `id`, `executionId` único, `hashAlgorithm`, `rngAlgorithm`, `protocolVersion`, `canonicalizationVersion`, `configurationHash` y `commitmentHash`.
- `seedCiphertext` y `custodyKeyId`; nunca semilla previa al reveal en claro.
- `committedAt`, `committedByUserId`.
- `revealedSeed?`, `revealedAt?`, `revealEvidenceHash?`.

Invariantes:

- RNG criptográfico es obligatorio aun sin commit-reveal.
- En modo commit-reveal, la ejecución no inicia sin commitment publicado.
- La semilla no se revela antes del cierre permitido y el commitment no cambia.
- La secuencia completa debe ser verificable contra algoritmo/versiones registradas.

**DECISIÓN FÍSICA CERRADA:** el contrato de custodia, publicación, cierre, revelación y verificación está documentado en `commit-reveal-protocol.md`. La integración futura con el gestor operativo de secretos y el publicador del compromiso es un gate de ETAPA 5/operación, no un bloqueo del modelo.

### 6.13 `BingoDraw`

Evidencia autoritativa de cada extracción.

Campos:

- `id`, `eventId`, `roundId`, `executionId`.
- `sequence Int`, `ballNumber Int`.
- `drawnByUserId`, `drawnAt`.
- `requestId`, `idempotencyRecordId`.
- `previousEvidenceHash?`, `evidenceHash`, `rngEvidence Json` con allowlist/version.
- `stateVersion BigInt`.

Invariantes:

- `ballNumber BETWEEN 1 AND 75`.
- `UNIQUE (execution_id, sequence)` y `UNIQUE (execution_id, ball_number)`.
- FK compuesta impide mezclar ejecución/ronda/evento.
- `evidenceHash` único por ejecución y encadenado con la extracción anterior.
- Insert, actualización de versión, candidatos, auditoría y outbox ocurren en una transacción; publicación realtime ocurre después del commit.
- No se actualiza ni elimina una extracción confirmada.

Índice `(execution_id, sequence)` cubre snapshot/reconexión futura y evita depender de Redis.

### 6.14 `BingoWinGroup`, `BingoWinnerCandidate` y `BingoWinner`

`BingoWinGroup` representa todos los cartones que completaron una modalidad con la misma balota decisiva para una ronda/premio. Guarda `executionId`, `prizeId`, `patternId`, `decisiveDrawId`, `tiePolicySnapshot`, `detectedAt` y conteo.

`BingoWinnerCandidate` guarda `winGroupId`, `cardId`, `participantId` snapshot, `matchedMask`, `status`, `detectedAt`, `rejectionReason?`.

`BingoWinner` es evidencia confirmada independiente: `candidateId` único, `prizeId`, `validatedByUserId`, `validatedAt`, `validationPolicySnapshot`, `evidenceHash`, `publicDisplaySnapshot Json` con allowlist.

Invariantes:

- `UNIQUE (execution_id, prize_id, pattern_id, decisive_draw_id)` para el grupo.
- `UNIQUE (win_group_id, card_id)`; todos los simultáneos se conservan.
- La balota decisiva es FK a un draw de la misma ejecución.
- La política de empate proviene del snapshot anterior al inicio y no puede cambiar después de detectar candidatos.
- `DUAL_CONTROL` exige que el validador sea diferente de todo operador que haya ejecutado comandos sensibles en esa ejecución. Se recomienda constraint trigger diferible sobre el registro de actores, además del servicio transaccional.
- Rechazar candidato conserva fila, actor, motivo y auditoría.
- Desempate crea una relación `BingoTieBreak` desde el grupo origen hacia otra ronda/ejecución; no elimina candidatos originales.
- DTO público usa exclusivamente `publicDisplaySnapshot`: tarjeta sola o nombre parcial + tarjeta. Nunca documento, teléfono, dirección, correo ni relaciones Prisma completas.

### 6.15 `BingoExecutionActor`

Registro normalizado de quién operó una ejecución: `executionId`, `userId`, `firstActionAt`, `lastActionAt`, con PK compuesta. Permite imponer doble control aunque haya más de un operador y evita depender de un único `operatorUserId` informativo.

Un constraint trigger debe rechazar una validación dual si `(execution_id, validated_by_user_id)` aparece en esta tabla.

### 6.16 `BingoCommandIdempotency`

Campos:

- `id`, `eventId`, `executionId?`, `actorUserId`.
- `operation`, `keyHash`, `requestHash`.
- `status` (`PROCESSING`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL`).
- `responseStatus?`, `responseBody?` limitado/sin PII.
- `createdAt`, `completedAt?`, `expiresAt` según criticidad.

Invariantes:

- `UNIQUE (actor_user_id, operation, key_hash)`.
- Misma key con hash de request diferente devuelve conflicto.
- La fila se crea/bloquea en la misma transacción que el comando.
- Para comandos críticos, la evidencia mínima no expira antes de la retención corporativa aplicable.

### 6.17 `BingoAuditEvent`

Auditoría append-only específica, siguiendo el precedente de `SelfServiceAuditEvent` y evitando convertir `AuditLog` en una FK polimórfica.

Campos:

- `id`, `eventId`, `roundId?`, `executionId?`.
- `actorUserId?`, `actorPermission?`, `action`, `result`, `reason?`.
- `previousState Json?`, `newState Json?` con snapshots mínimos.
- `requestId`, `idempotencyKeyHash?`, `ipHash?`, `userAgentHash?`.
- `metadata Json?`, `createdAt`.

Invariantes:

- Append-only; no cascades desde evento/ronda/usuario. Usuario puede usar `SetNull` si la política global permite eliminarlo, conservando actor snapshot no sensible.
- No almacenar PII, tokens, claves, seed previa al reveal ni payloads completos.
- Índices `(event_id, created_at)`, `(execution_id, created_at)`, `(actor_user_id, created_at)` y `(action, created_at)`.
- Draw y Winner siguen siendo evidencia de dominio aunque exista auditoría.

Operaciones futuras obligatoriamente auditadas: crear/configurar/publicar; importar/aprobar/aplicar; asignar/reasignar; iniciar/extraer/pausar/reanudar/cancelar/reiniciar; detectar/validar/rechazar; exportar; acceder a datos privados; retirar fingerprints/artefactos; cambios de retención y fairness.

### 6.18 `BingoOutboxEvent`

Preparación transaccional para SSE/fan-out futuro, sin implementar SSE en esta etapa.

Campos:

- `id`, `eventId`, `executionId?`, `sequence BigInt`.
- `type`, `aggregateVersion BigInt`, `publicPayload Json` sin PII.
- `createdAt`, `publishedAt?`, `attemptCount`, `lastError?` sanitizado.

Invariantes:

- Se crea en la transacción del cambio PostgreSQL.
- `UNIQUE (event_id, sequence)` da orden y futuro `Last-Event-ID`.
- `UNIQUE (execution_id, aggregate_version, type)` donde aplique evita duplicados.
- Redis distribuye después, pero un snapshot REST reconstruye desde PostgreSQL.

### 6.19 Importación y staging

`BingoImportBatch`:

- `id`, `eventId`, `format CSV|XLSX`, `status`.
- `originalFilename` sanitizado, `storageReference`, `sha256`.
- `sizeBytes`, `sheetCount?`, `rowCount?`, `validCount`, `errorCount`, `unresolvedCount`.
- `uploadedByUserId`, `approvedByUserId?`, timestamps y retenciones.
- parámetros/versiones del validador y resumen de errores.

`BingoImportRow`:

- `id`, `batchId`, `rowNumber`, `sheetName?`, `status`.
- `normalizedPayloadEncrypted` o columnas mínimas tipadas; nunca PII libre en logs.
- `externalSubjectId?` y `participantId?`; una fila no resuelta no crea una identidad maestra.
- `errorCodes String[]`, `appliedAt?`.

`BingoImportApplicationChunk`:

- `batchId`, `sequence`, `firstRow`, `lastRow`, `status`, `attemptCount`, timestamps.
- Permite batches explícitos, recuperables e idempotentes sin fingir atomicidad de 50.000 filas si los benchmarks no la soportan.

Invariantes:

- `UNIQUE (event_id, sha256)` previene reimportación accidental; un override futuro debe ser explícito y auditado, no eludir el hash.
- `UNIQUE (batch_id, row_number, sheet_name)`.
- `APPROVED` requiere preview y actor diferente cuando la política lo exija.
- Una fila no resuelta queda `UNRESOLVED`; jamás crea automáticamente persona, Customer o Affiliate.
- Aplicar una fila crea/reutiliza participación y asignación bajo los mismos constraints que la API.
- Archivo original, staging y errores tienen retención independiente.
- Controles XLSX obligatorios: magic bytes, ZIP ratio/tamaño descomprimido, macros, fórmulas, vínculos externos, cifrado, corrupción y límites de hojas/filas/columnas/celdas.
- CSV exportado neutraliza formula injection en toda celda que comience con `=`, `+`, `-`, `@`, tab o retorno.

### 6.20 Retención

`BingoRetentionPolicy` contiene `eventId`, `category`, `configuredRetentionDays`, `corporateMinimumDays`, `effectiveRetentionDays`, `legalHold`, `configuredByUserId` y timestamps, con `UNIQUE (event_id, category)`.

Los artefactos gobernados llevan `retentionUntil` y `legalHoldAt`. Cambiar la política nunca puede acortar retroactivamente evidencia por debajo del mínimo efectivo ya registrado.

- Temporales, originales y staging pueden expirar y eliminarse mediante job auditado.
- Participación/cartones pueden anonimizarse según política, preservando claves/evidencia no personal.
- Draws, candidatos, ganadores, auditoría y evidencia crítica tienen mínimos corporativos y no admiten eliminación inmediata administrativa.
- Legal hold prevalece sobre cualquier vencimiento.

**RECOMENDACIÓN:** extender posteriormente `RetentionRecordCategory` solo para categorías corporativas de alto nivel o mantener reglas Bingo específicas conectadas al mismo servicio. No reutilizar una sola categoría para duraciones distintas.

**GATE JURÍDICO FUTURO:** Cumplimiento debe aprobar los valores corporativos concretos y el tratamiento legal de ganadores/premios antes de producción. El modelo no inventa plazos legales y ya impide configurar una retención efectiva inferior al mínimo corporativo persistido.

## 7. Constraints compuestos y aislamiento entre eventos

La migración debe crear claves candidatas como `UNIQUE (id, event_id)` en entidades referenciadas por tablas que también contienen `eventId`. Las FKs hijas serán compuestas:

- ronda → evento;
- premio/patrón de ronda/ejecución → `(roundId, eventId)`;
- asignación → `(cardId, eventId)` y `(participantId, eventId)`;
- draw/estado/candidato → `(executionId, roundId, eventId)`;
- ganador → candidato, premio y grupo del mismo contexto;
- sucesión de asignación y revisión → mismo agregado.

Esto hace que PostgreSQL, no solo NestJS, rechace IDs válidos mezclados entre eventos (defensa contra IDOR y errores internos).

## 8. Transiciones y congelamiento

### Evento

```text
DRAFT -> CONFIGURED -> PUBLISHED -> IN_PROGRESS -> COMPLETED -> ARCHIVED
   \          \             \             \
    +----------+-------------+---------------> CANCELLED
```

No se permiten regresiones. Cancelar conserva todas las filas. Archivar es lógico.

### Ejecución

```text
PLANNED -> RUNNING <-> PAUSED -> COMPLETED
    \         \          \
     +---------+-----------> CANCELLED -> nueva revisión PLANNED
```

Cada transición crítica bloquea la ejecución `FOR UPDATE`, verifica `stateVersion`, registra idempotencia/auditoría/outbox y confirma antes de publicar.

Congelamientos:

- Configuración de evento: antes de publicar/iniciar según el campo.
- Elegibilidad/asignaciones: antes de iniciar la ejecución aplicable.
- Política de ganador, empate, premios, patrones y fairness: antes de `RUNNING`.
- Semilla/reveal: conforme al protocolo versionado.

## 9. Índices prioritarios para la capacidad objetivo

| Consulta crítica         | Índice recomendado                                                |
| ------------------------ | ----------------------------------------------------------------- |
| evento por URL           | único `events(slug)`                                              |
| eventos operables        | parcial `events(scheduled_start_at) WHERE status IN (...)`        |
| participante afiliado    | único parcial `(event_id, affiliate_id)`                          |
| participantes por estado | `(event_id, status, id)`                                          |
| cartón por número        | único `(event_id, display_number)`                                |
| cartón duplicado         | único `(event_id, layout_hash)`                                   |
| máscaras para evaluación | `card_pattern_masks(event_id, pattern_id, card_id)`               |
| asignación activa        | único parcial `(event_id, card_id) WHERE status='ACTIVE'`         |
| cartones de participante | `(event_id, participant_id, status)`                              |
| ejecución actual         | único parcial `(round_id) WHERE status IN ('RUNNING','PAUSED')`   |
| secuencia/balota         | únicos `(execution_id, sequence)` y `(execution_id, ball_number)` |
| snapshot/reconexión      | `(execution_id, sequence)` y outbox `(event_id, sequence)`        |
| candidatos simultáneos   | `(win_group_id, card_id)` único                                   |
| auditoría                | `(event_id, created_at)`, `(execution_id, created_at)`            |
| import preview           | `(batch_id, status, row_number)`                                  |

50.000 participantes/cartones no requieren particionamiento desde el primer despliegue, pero todas las tablas voluminosas incluyen `eventId` para permitir particionamiento PostgreSQL futuro sin cambiar contratos de dominio. La necesidad real se decide con `EXPLAIN (ANALYZE, BUFFERS)`, tamaño de índices y pruebas de carga.

## 10. Privacidad y superficies

- Público: slug, estado, ronda, balotas, secuencia, patrón, cartón ganador y nombre parcial solo si la política lo permite.
- Afiliado: exclusivamente participaciones/cartones cuyo `affiliateId` coincide con la identidad resuelta.
- Administrativo: DTO por permiso; datos sensibles solo cuando son necesarios y auditados.
- SSE/outbox: nunca documento, teléfono, correo, dirección, token, seed no revelada, payload de importación ni relaciones Prisma completas.
- Los snapshots públicos se construyen por allowlist al validar ganador; no se derivan serializando `Customer`.
- Hashes de IP/user-agent pueden usarse en auditoría siguiendo la política corporativa; no constituyen identificador público.

## 11. Auditoría, inmutabilidad y privilegios

Además de constraints de modelo, producción debe restringir UPDATE/DELETE de `BingoDraw`, `BingoWinner`, `BingoAuditEvent` y compromisos confirmados al rol runtime normal. Correcciones se expresan mediante nuevas filas/estados y auditoría, no reescritura.

La cadena de evidencia incluye:

1. configuración/versiones congeladas;
2. commitment si aplica;
3. asignaciones y snapshot de ejecución;
4. draws encadenados;
5. candidatos simultáneos y balota decisiva;
6. validaciones/rechazos;
7. ganadores y política de empate;
8. audit event e idempotencia;
9. outbox derivado post-commit.

## 12. Reglas que necesariamente viven en transacción/servicio

PostgreSQL debe garantizar todo lo expresable localmente, pero estas reglas requieren lock/consulta multi-fila o constraint trigger:

- máximo de cartones activos por participante según configuración del evento;
- impedir reasignación después de iniciar una ejecución aplicable;
- transición de estados y bloqueo de configuración;
- mismo actor no puede operar y validar bajo doble control;
- todos los candidatos de la misma balota decisiva se materializan juntos;
- aplicación idempotente de imports;
- mínimos corporativos dinámicos de retención;
- generación RNG y verificación commit-reveal.

No deben quedar como validaciones exclusivas de frontend.

## 13. Decisiones cerradas incorporadas

1. Varias rondas y premios: `BingoRound`/`BingoPrize` 1:n.
2. Elegibilidad flexible: reglas combinables por evento.
3. Identidad: participación referencia `Affiliate.id`; nunca búsquedas aproximadas.
4. Múltiples cartones: máximo por evento, no global.
5. Reasignación: historial con sucesión, actor, motivo, contexto y requestId.
6. Visibilidad: enum configurable por evento.
7. Consulta segura: número de cartón no autentica; sesión/token/OTP queda en capa de acceso.
8. Launcher administrativo: Herramientas no contiene técnicamente el dominio Bingo.
9. Rutas administrativas: el modelo permanece independiente de `/admin/herramientas` y `/admin/bingo`.
10. Roles especializados: FKs a `User`; autorización futura por permisos.
11. Validación simple/doble: snapshot y `BingoExecutionActor`.
12. Empates: `BingoWinGroup` conserva todos los simultáneos y política congelada.
13. Reinicio: nueva `BingoRoundExecution`; cancelada conserva evidencia.
14. Imparcialidad: RNG seguro obligatorio y commitment configurable/versionado.
15. CSV/XLSX: staging real, hash, preview, aprobación y aplicación recuperable.
16. Capacidad: claves/índices event-scoped, masks y estrategia por benchmark.
17. Retención: regla por evento/categoría y mínimos efectivos.
18. Ganador público: snapshot por allowlist sin PII.
19. Feature flags: responsabilidad de configuración/API, sin contaminar evidencia de dominio.
20. Una VPS inicialmente: modelo no depende de proceso único; idempotencia/outbox permiten réplicas futuras.

## 14. Implementación y validación de ETAPA 3

1. El benchmark reproducible comparó modelo normalizado, arrays/GIN, bitsets y `bytea` sobre 5k/10k/25k/50k cartones.
2. Prisma incorporó los agregados finales sin datos seed Bingo ni alteraciones destructivas de dominios existentes.
3. La migración `20260809180000_add_bingo_domain` añadió checks de lifecycle, FKs compuestas anti-cross-event, índices parciales, validación canónica de cartón y triggers de evidencia/configuración.
4. Las pruebas PostgreSQL cubren integridad, referencias cruzadas, lifecycle, concurrencia de asignación/participación/idempotencia/ejecución/draws, privacidad, commit-reveal y migración.
5. Los documentos `retention-policy.md`, `commit-reveal-protocol.md` y `stage3-governance-review.md` registran las decisiones de governance.
6. El motor, los comandos funcionales, las APIs, Redis/SSE, la importación ejecutable y las interfaces continúan deliberadamente fuera de ETAPA 3.

## 15. Gates futuros no estructurales

Las seis decisiones que antes bloqueaban Prisma ya están resueltas. Permanecen como gates de etapas posteriores, no como lagunas del modelo:

- conectar la capa de resolución con la fuente oficial real de beneficiarios y miembros empresariales;
- configurar custodia de secretos y publicación externa según el protocolo commit-reveal;
- obtener aprobación jurídica de los días mínimos corporativos concretos;
- implementar en servicio las transiciones, locks y límites dinámicos que requieren consultas multi-fila;
- volver a medir el modelo híbrido con WAL, presión real y configuración de staging/VPS;
- definir DTOs públicos/privados por allowlist antes de exponer cualquier superficie.

Decisiones operativas no bloqueantes para el esquema:

- contenido exacto de premios no monetarios;
- nombre parcial público concreto;
- límites corporativos máximos superiores a los objetivos declarados;
- estrategia futura de particionamiento, que se decidirá con métricas.

## 16. Riesgos y mitigaciones

| Riesgo                                      | Nivel | Mitigación propuesta                                                                                                   |
| ------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Inventar identidad de beneficiario/empleado | Alto  | `BingoAuthorizedExternalSubject`, fingerprint y resolución fail-closed; nunca crear persona automáticamente            |
| Mezcla de IDs entre eventos (IDOR interno)  | Alto  | `eventId` y FKs compuestas en tablas operativas                                                                        |
| Dos extracciones o secuencias duplicadas    | Alto  | lock, SERIALIZABLE, uniques e idempotencia                                                                             |
| Ocultar ganadores simultáneos               | Alto  | grupo único por balota decisiva y candidatos 1:n atómicos                                                              |
| Reasignar durante operación                 | Alto  | lock de ejecución y candidato anclado a la asignación histórica mediante FK compuesta                                  |
| Doble control solo en frontend              | Alto  | actor normalizado + constraint trigger y transacción                                                                   |
| Evaluación de 50.000 cartones               | Medio | array canónico + máscaras `bit(75)` benchmarkeadas; repetir medición en staging                                        |
| JSON sin contrato                           | Medio | JSON solo para extensiones pequeñas, DTO versionado y allowlist                                                        |
| PII en evidencia/SSE                        | Alto  | snapshots mínimos, cifrado staging y DTO público dedicado                                                              |
| Retención que borra evidencia               | Alto  | mínimos efectivos, legal hold, FKs Restrict y jobs auditados                                                           |
| Commit-reveal impropio                      | Alto  | protocolo versionado, `configurationHash`, canonicalización y semilla cifrada; custodia operativa antes de habilitarlo |

## 17. Criterio de preparación

El modelo físico de ETAPA 3 está implementado. Su cierre formal depende de que la rama integrada complete todos los quality gates —migraciones limpia y upgrade, seeds, pruebas PostgreSQL, lint, typecheck, suites, build, E2E y GitHub Actions—. Este documento no autoriza ETAPA 4 ni convierte las estructuras de persistencia en un motor funcional.
