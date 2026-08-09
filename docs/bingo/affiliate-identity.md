# Identidad externa de afiliados — fundamento para Bingo

## Alcance

Esta decisión pertenece exclusivamente a la ETAPA 1. No crea rutas, permisos, entidades ni lógica de Bingo. Establece el puente autorizado `subjectRef externo -> AffiliateExternalIdentity -> Affiliate.id` sin duplicar personas ni autenticación.

## Hechos verificados

- `Affiliate.id` es el UUID interno; `Affiliate` ya referencia a `Customer`.
- Las sesiones de autoservicio mantienen el `subjectRef` cifrado y lo exponen mediante `SelfServicePrincipal`.
- El repositorio solo incluye el proveedor externo `not_configured`; todavía no existe el adaptador HTTP real ni está confirmado el contrato de lifecycle del proveedor.
- El `subjectRef` es opaco: ASODEF no lo normaliza, interpreta ni persiste en claro.

## Modelo e invariantes

`AffiliateExternalIdentity` representa una emisión lógica de identidad. Sus campos mínimos son `affiliateId`, `issuer`, `status`, `verifiedAt`, `lastVerifiedAt`, `deactivatedAt`, `replacedByIdentityId` y timestamps. Sus estados son:

- `ACTIVE`: resoluble; no tiene fecha de desactivación ni reemplazo.
- `REPLACED`: histórico, no resoluble; conserva fecha y referencia a la identidad sucesora.
- `REVOKED`: histórico, no resoluble; conserva fecha y no tiene sucesora.

`AffiliateExternalIdentityFingerprint` contiene exclusivamente `identityId`, `issuer`, `keyId`, `subjectRefHash`, `lastUsedAt`, `retiredAt` y timestamps. Una identidad puede tener varias huellas del mismo sujeto, una por versión criptográfica.

PostgreSQL garantiza:

- como máximo una identidad `ACTIVE` por `(affiliateId, issuer)` mediante índice único parcial;
- una huella única por `(issuer, keyId, subjectRefHash)`, por lo que una versión de un sujeto no puede pertenecer a dos identidades;
- una sola huella por `(identityId, keyId)`;
- coherencia entre `identityId` e `issuer` mediante FK compuesta;
- estados y fechas coherentes mediante `CHECK`;
- cadena de reemplazo uno-a-uno, sin autorreferencia;
- conservación del afiliado mediante `ON DELETE RESTRICT`.

Las transacciones serializables, el bloqueo del afiliado y las restricciones anteriores trabajan conjuntamente. La aplicación nunca confía solamente en comprobaciones previas a una escritura.

## Lifecycle

### Creación y reintento

`linkVerifiedSubject()` solo acepta un sujeto que un flujo confiable ya haya verificado. Si no existe identidad activa, crea una identidad y todas las huellas del keyring de transición. Repetir concurrentemente el mismo vínculo es idempotente. Un sujeto asociado a otro afiliado, una identidad activa con otro sujeto o la reactivación implícita de un sujeto histórico producen conflicto.

### Reemplazo

`replaceVerifiedSubject()` exige el `Affiliate.id` y la identidad activa conocida. En una sola transacción crea la nueva emisión, convierte la anterior en `REPLACED`, enlaza `replacedByIdentityId` y activa la sucesora. No actualiza la huella de la identidad anterior ni borra historia. Repetir exactamente el reemplazo devuelve la sucesora; intentar reemplazar hacia otro vínculo produce conflicto.

### Revocación y nueva emisión

`revokeIdentity()` cambia únicamente `ACTIVE -> REVOKED` y conserva la evidencia. Es idempotente para una identidad ya revocada. Después puede emitirse una identidad nueva para el mismo afiliado/issuer, pero el sujeto revocado no se reactiva silenciosamente.

### Resolución

`resolveSubject()` calcula las huellas con todas las versiones aceptadas, pero solo resuelve una identidad `ACTIVE` y una huella no retirada. Cero coincidencias o una situación ambigua fallan como no autorizadas. Una resolución con una clave anterior agrega de forma transaccional la huella de la clave activa y actualiza `lastUsedAt`/`lastVerifiedAt`.

Estas operaciones son servicios internos, no controllers. Cuando sean expuestas a un flujo operativo deberán contar con autenticación, autorización, motivo y auditoría.

## Rotación criptográfica

La configuración usa tres contratos independientes:

- `EXTERNAL_IDENTITY_HMAC_KEY_ID`: identificador estable de la clave activa;
- `EXTERNAL_IDENTITY_HMAC_KEY`: secreto activo dedicado, mínimo 32 caracteres;
- `EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS`: objeto JSON `keyId -> secreto` con las claves aceptadas durante la transición.

Procedimiento previsto:

1. generar una clave nueva y un `keyId` nunca reutilizado;
2. mover temporalmente la clave anterior a `EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS` y activar la nueva;
3. resolver o verificar sujetos contra el keyring solapado; cada uso materializa la huella nueva sin almacenar el sujeto;
4. medir que no queden identidades activas dependientes únicamente de la versión anterior;
5. marcar sus huellas `retiredAt` mediante una futura operación autorizada y auditada;
6. retirar el secreto anterior de configuración.

No se debe retirar una versión hasta demostrar cobertura completa o revalidar los sujetos pendientes contra el proveedor. Reutilizar un `keyId` para otro secreto está prohibido. La superposición es la que permite detectar el mismo sujeto en ambas versiones durante la transición.

## Separación de claves y fallo cerrado

El servicio de fingerprints no conoce ni consulta `ENCRYPTION_KEY`. No existe fallback. Si falta el `keyId`, la clave dedicada o el issuer/proveedor, la operación falla cerrada sin consultar ni modificar identidades. La validación de entorno exige estos valores cuando `EXTERNAL_CORE_PROVIDER=http` y rechaza keyrings mal formados o que repitan el `keyId` activo.

`ENCRYPTION_KEY` protege otros datos del autoservicio y puede rotarse independientemente; nunca produce huellas de identidad.

## Dependencias todavía no confirmadas

Antes de conectar un proveedor real deben confirmarse contractualmente:

- estabilidad y unicidad del `issuer`;
- alcance del `subjectRef` (global, tenant o aplicación);
- eventos o señales de revocación, reemplazo y reemisión;
- prueba que autoriza cada vínculo y reemplazo;
- comportamiento ante fusiones o correcciones de cuentas externas;
- disponibilidad de revalidación masiva durante rotaciones incompletas.

Sin ese contrato no se habilitará la experiencia autenticada de Bingo. Las operaciones implementadas son el núcleo seguro, no una autorización para inferir lifecycle.

## Auditoría futura obligatoria

Todo vínculo, reintento, conflicto, reemplazo, revocación, nueva emisión, resolución sensible, adición o retiro de versión deberá registrar actor/sistema, acción, identidad, afiliado, issuer, keyId (nunca secreto ni sujeto), estado anterior/nuevo, motivo, requestId, resultado, timestamp e IP/user-agent cuando aplique. La auditoría se incorporará al flujo que exponga estas operaciones; no existe todavía un endpoint que permita ejecutarlas externamente.
