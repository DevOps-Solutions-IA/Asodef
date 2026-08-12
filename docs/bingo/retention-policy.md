# Bingo ASODEF — Política de retención y gobierno de datos

Estado: contrato arquitectónico para ETAPA 3. No habilita borrado, anonimización ni jobs de retención.

## 1. Alcance y relación con ASODEF

Esta política clasifica los datos del dominio Bingo y define cómo el modelo debe expresar su retención sin convertir Bingo en maestro de identidad. Se apoya en los siguientes hechos verificados:

- ASODEF ya tiene `RetentionPolicy`, `RetentionRecordCategory`, revisión administrativa y evidencia de anonimización.
- Los periodos existentes están deliberadamente sin configurar cuando no existe una decisión corporativa o jurídica aprobada.
- `Affiliate`, `Customer`, `Company` y sus datos de contacto pertenecen a dominios maestros; Bingo solo referencia esas entidades.
- Draws, ejecuciones, candidatos, ganadores, asignaciones y compromisos criptográficos son evidencia de dominio y no pueden depender únicamente de `AuditLog`.

La política Bingo complementa, no reemplaza, la política corporativa. Cualquier operación futura de disposición deberá integrarse al proceso corporativo de revisión, permisos y auditoría. ETAPA 3 solo crea metadatos y restricciones; no implementa ejecución automática.

## 2. Principios obligatorios

1. **Minimización:** almacenar únicamente los datos necesarios para operar, verificar y auditar el evento.
2. **Separación de dominios:** Bingo no crea ni duplica `Affiliate`, `Customer`, beneficiarios, usuarios ni personas de empresas.
3. **Finalidad explícita:** cada snapshot debe tener propósito documentado; no se aceptan copias completas de perfiles.
4. **Plazo efectivo verificable:** una fila solo puede ser candidata de disposición cuando haya política aplicable, `retentionUntil` vencido y ausencia de `legalHold`.
5. **Mínimo corporativo:** para evidencia crítica, la configuración del evento nunca puede reducir el mínimo corporativo aprobado.
6. **Conservación de evidencia:** reinicio, cancelación, reasignación, rechazo o rollback nunca borran evidencia histórica.
7. **Restricción referencial:** FKs críticas usan `RESTRICT`; una política no puede provocar cascadas destructivas.
8. **Fail-closed:** periodo no configurado, categoría desconocida o evaluación ambigua significa conservar y escalar a revisión.
9. **Trazabilidad:** toda futura disposición exige actor, permiso, motivo, requestId, resultado y evidencia de la acción.
10. **Separación jurídica:** este documento no establece plazos legales colombianos; esos mínimos requieren validación jurídica formal.

## 3. Modelo de política

El modelo físico debe permitir distinguir cuatro conceptos:

| Concepto           | Propósito                                                | Regla                                                           |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------- |
| `retentionPolicy`  | Referencia/versionado de la política aplicada            | Debe identificar categoría, versión y origen corporativo/evento |
| `retentionUntil`   | Fecha individual calculada de elegibilidad para revisión | No autoriza por sí sola eliminación o anonimización             |
| `legalHold`        | Suspensión explícita de toda disposición                 | Prevalece sobre cualquier fecha o política                      |
| `evidenceCategory` | Clasificación estable de sensibilidad/evidencia          | Gobierna mínimos y operaciones permitidas                       |

La recomendación para ETAPA 3 es:

- `BingoRetentionPolicy`: regla única por `(eventId, category)`, con `configuredRetentionDays`, `corporateMinimumDays`, `effectiveRetentionDays`, `legalHold`, actor y timestamps.
- Campos directos `retentionUntil` y `legalHoldAt` en artefactos con lifecycle individual, especialmente imports y evidencia. `legalHoldAt IS NOT NULL` significa hold individual vigente.
- Categoría de evidencia explícita en artefactos heterogéneos/outbox/auditoría, evitando inferirla desde nombres libres.
- El periodo efectivo se calcula como el mayor entre el solicitado por el evento y el mínimo corporativo vigente. Si alguno requerido no está configurado, la disposición queda bloqueada.

`retentionUntil` debe calcularse desde el hito correcto de cada categoría —por ejemplo, cierre oficial del evento, finalización del import o expiración del archivo temporal— y no indiscriminadamente desde `createdAt`.

El modelo físico actual actualiza la fila única de política y no conserva versiones por sí mismo. Por tanto, cambiar una política:

- nunca acorta retroactivamente una evidencia por debajo del mínimo aplicable;
- debe crear un `BingoAuditEvent` append-only con el valor anterior/nuevo antes de considerarse una operación completa; una versión explícita de política queda como hardening no bloqueante previo a implementar retención;
- recalcula solo mediante una operación futura explícita, auditable e idempotente;
- no elimina datos durante la modificación.

## 4. Categorías y tratamiento

| Categoría funcional     | Clase               | Datos incluidos                                        | Inicio del plazo                    | Disposición futura permitida                               | Restricciones                                                                |
| ----------------------- | ------------------- | ------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Archivos temporales     | Temporal            | cuarentena, chunks, artefactos intermedios             | creación/último uso verificado      | eliminación física del artefacto                           | no borrar hash, batch ni evidencia de validación requerida                   |
| Importación original    | Importación         | CSV/XLSX original y metadatos de archivo               | cierre/rechazo del batch            | eliminación del binario; conservar hash y resultado mínimo | `legalHold`; no eliminar mientras el batch esté activo                       |
| Staging de importación  | Operativo temporal  | filas normalizadas, errores, payload controlado        | finalización/expiración del batch   | anonimización o eliminación de datos de staging            | conservar contadores, hash, actor, resultado y auditoría mínima              |
| Participación           | Operativo           | inscripción event-scoped y evidencia de elegibilidad   | cierre oficial del evento           | anonimización selectiva cuando sea jurídicamente válida    | nunca elimina la identidad maestra; conservar trazabilidad necesaria         |
| Cartones                | Evidencia           | layout, hash, número de evento, generación             | cierre oficial del evento           | conservación según mínimo corporativo; eventual archivo    | cartón usado en ejecución no se borra mientras sobreviva su evidencia        |
| Asignaciones            | Evidencia           | historia de dueño operativo, actor, motivo, requestId  | cierre oficial del evento           | conservación/archivo                                       | no borrar ni sobrescribir reasignaciones históricas                          |
| Rondas y ejecuciones    | Evidencia crítica   | configuración congelada, revisiones, estados, actores  | cierre oficial del evento/ejecución | conservación                                               | cancelación o restart no inician borrado anticipado                          |
| Extracciones            | Evidencia crítica   | secuencia, balota, hashes, actor, timestamps           | cierre oficial de ejecución         | conservación                                               | inmutable; sin cascades destructivos                                         |
| Candidatos              | Evidencia crítica   | patrón, cartón, balota decisiva, estado                | resolución oficial                  | conservación                                               | incluye rechazados y razón; soporta reconstrucción de empates                |
| Ganadores               | Evidencia crítica   | validación, premio, empate, hashes, actores            | resolución oficial                  | conservación                                               | no sustituir múltiples ganadores por uno; no borrar rechazo/aprobación       |
| Auditoría               | Auditoría crítica   | acción, actor, requestId, before/after minimizado      | timestamp del evento auditado       | conservación según mínimo corporativo                      | no almacenar secretos ni payloads completos innecesarios                     |
| Evidencia criptográfica | Evidencia crítica   | commitment, algoritmo/versiones, reveal y verificación | reveal/cierre oficial               | conservación                                               | nunca conservar semilla legible antes del reveal en una superficie accesible |
| Idempotencia            | Operativo/seguridad | key, scope, request hash, estado/resultado mínimo      | terminalización del comando         | expiración controlada cuando no afecte reconstrucción      | no guardar request/response completos con PII                                |
| Outbox                  | Operativo           | evento mínimo, agregado, secuencia, estado             | publicación confirmada              | compactación/eliminación futura                            | PostgreSQL de dominio permanece fuente de verdad; payload sin PII            |

La clasificación física debe ser suficientemente granular para que import originals y staging tengan ventanas diferentes, y para que evidencia crítica no herede accidentalmente la ventana corta de datos temporales.

## 5. Mínimos corporativos y configuración del evento

Los mínimos corporativos deben ser parametrizados y aprobados fuera del código de negocio. ETAPA 3 no asigna números de días.

Reglas de precedencia:

1. `legalHold = true` bloquea toda disposición.
2. Una obligación jurídica confirmada prevalece sobre la preferencia del evento.
3. El mínimo corporativo prevalece sobre una ventana menor solicitada por el evento.
4. Una ventana mayor del evento puede conservarse si tiene finalidad aprobada y proporcional.
5. Si falta el mínimo corporativo requerido, la categoría se considera `NOT_CONFIGURED` y se conserva.
6. Liberar un `legalHold` no elimina automáticamente: devuelve el registro a revisión y recalcula elegibilidad.

Los plazos definitivos deben quedar en un catálogo administrable/versionado, con evidencia de aprobación corporativa y, cuando corresponda, jurídica. No deben quedar codificados en enums, migraciones o constantes dispersas.

## 6. Privacidad por tipo de participante

### Afiliado

- `BingoParticipant` referencia `Affiliate.id`.
- No copia documento, teléfono, email, dirección ni perfil de `Customer`.
- La sesión externa se resuelve previamente mediante `AffiliateExternalIdentity`; Bingo no almacena `subjectRef`.

### Beneficiario

- Se referencia la fuente oficial mediante un identificador estable cuando exista el resolver autorizado.
- Hasta existir esa fuente, no se crea una persona sustituta en Bingo ni se reutiliza una coincidencia por nombre/documento.
- La evidencia de resolución conserva proveedor/tipo, referencia opaca y versión, no la respuesta completa.

### Persona de empresa aliada

- Se vincula a `Company` mediante `BingoAuthorizedExternalSubject`, una autorización/identidad event-scoped.
- No se crea automáticamente `Affiliate`, `Customer` ni `User`.
- La fuente autorizante, referencia, actor/issuer y vigencia son obligatorios.

### Invitado autorizado

- Usa `BingoAuthorizedExternalSubject` con `issuer`, `keyId`, `subjectRefFingerprint` y, cuando aplique, `sourceReferenceHash`; no guarda la referencia externa en claro.
- Cualquier nombre de exhibición debe ser mínimo, cifrado cuando se conserve y separado del DTO público.
- Contacto solo se almacena si existe una finalidad operacional aprobada; no se usa como autenticador único.

## 7. Snapshots permitidos y prohibidos

Snapshots permitidos, con allowlist y finalidad:

- `publicDisplaySnapshot`: número de cartón y, si la política lo permite, nombre parcial ya anonimizado. Nunca se deriva dinámicamente de un perfil actual para reescribir historia.
- `eligibilityEvidence`: tipo de regla, resolver/fuente, referencia opaca, versión, resultado y timestamp.
- Snapshots de configuración: política de empate, validación, fairness, patrón y versión utilizadas.
- Evidencia de asignación: IDs internos, actor, motivo, timestamps y requestId.

Snapshots prohibidos:

- objetos Prisma completos;
- documento, teléfono, dirección o email en payloads JSON genéricos;
- respuestas completas de proveedores externos;
- tokens, OTP, semillas no reveladas o secretos;
- filas originales de importación dentro de auditoría/outbox;
- perfiles completos de afiliado, beneficiario, empleado o invitado.

Todo JSON debe tener schema/version y allowlist. No se acepta `metadata` como depósito irrestricto.

## 8. Legal hold

`BingoRetentionPolicy.legalHold` aplica a la categoría completa del evento y `legalHoldAt` a un artefacto individual. La evaluación efectiva es OR: cualquier hold vigente en la cadena aplicable bloquea la disposición.

Cada cambio de hold debe conservar:

- actor y permiso;
- alcance/categoría/registro;
- motivo y referencia del caso;
- `requestId`;
- fecha de activación/liberación;
- estado anterior y nuevo.

No se permite que el mismo job que descubre candidatos libere holds o ejecute disposición. La liberación requiere una decisión administrativa independiente.

## 9. Proceso futuro de disposición

Fuera de ETAPA 3, un proceso seguro deberá separar:

1. descubrimiento de candidatos;
2. validación de política/versiones y mínimos;
3. revisión de holds y dependencias;
4. vista previa sin PII innecesaria;
5. aprobación con `retention.manage` y, para evidencia crítica, control reforzado;
6. anonimización o eliminación selectiva en transacción/lotes recuperables;
7. registro inmutable del resultado;
8. verificación posterior.

No se autorizan cascades, SQL ad hoc ni cron que borre por fecha sin revisión. Para evidencia crítica, el comportamiento inicial debe ser conservar/archivar; cualquier eliminación futura requiere diseño, pruebas, revisión jurídica y autorización separada.

## 10. Pruebas y gates futuros

El cierre de una implementación de retención requerirá, como mínimo:

- periodo ausente conserva y reporta `not_configured`;
- mínimo corporativo prevalece sobre configuración menor;
- evento puede solicitar periodo mayor;
- `legalHold` de evento o fila bloquea toda acción;
- liberación de hold no borra automáticamente;
- `retentionUntil` usa el hito correcto y zona horaria inequívoca;
- FKs `RESTRICT` preservan draws, winners, executions y assignments;
- anonimización no rompe hashes, evidencia ni referencialidad;
- reintentos son idempotentes;
- logs/outbox no contienen PII eliminada;
- concurrencia entre hold y disposición resuelve fail-closed;
- regresión del módulo corporativo de retención permanece verde.

## 11. Decisiones pendientes fuera de ETAPA 3

- Mínimos corporativos por categoría.
- Validación jurídica de obligaciones y derechos aplicables.
- Operaciones permitidas por categoría: archivo, anonimización o eliminación.
- Custodia y acceso al almacenamiento de imports originales.
- Proceso reforzado de aprobación para evidencia crítica.
- Política de conservación de backups/PITR, que no puede deducirse únicamente de filas activas.

Estas decisiones no bloquean la creación de campos/categorías expand-only; sí bloquean cualquier job destructivo o fecha de borrado efectiva en producción.
