# Identidad externa de afiliados — fundamento para Bingo

## Alcance

Esta decisión pertenece a la ETAPA 1. No crea rutas, permisos, tablas ni lógica de Bingo. Establece el único puente autorizado para que un `subjectRef` emitido por el núcleo externo se resuelva hacia el `Affiliate.id` interno que usarán posteriormente los dominios nativos de ASODEF.

## Hechos verificados

- `Affiliate.id` es un UUID interno y `Affiliate` ya referencia a `Customer`; no se debe duplicar ninguna persona.
- Las sesiones de autoservicio conservan `subjectRef` cifrado y lo entregan en `SelfServicePrincipal`.
- Antes de este cambio no existía una relación persistente entre ese `subjectRef` y `Affiliate.id`.
- El repositorio solo incluye actualmente el proveedor externo `not_configured`; el selector falla de forma cerrada si se configura un adaptador HTTP que aún no está instalado.

## Decisión implementada

La identidad externa se representa mediante `AffiliateExternalIdentity`:

- `issuer` identifica de forma estable a la autoridad externa confiable y proviene exclusivamente de configuración del servidor.
- `subjectRefHash` es un HMAC-SHA-256 sensible a mayúsculas y espacios, firmado con una clave exclusiva de identidad externa. El `subjectRef` opaco nunca se normaliza ni se almacena en texto claro.
- `(issuer, subjectRefHash)` es único: un sujeto no puede vincularse a dos afiliados.
- `(issuer, affiliateId)` es único: un afiliado no puede tener dos sujetos en la misma autoridad.
- La FK hacia `Affiliate` usa `ON DELETE RESTRICT` para impedir identidades huérfanas o eliminaciones accidentales.
- Los `CHECK` de PostgreSQL validan el tamaño del issuer, el largo exacto del HMAC y el orden temporal de las verificaciones.

`AffiliateIdentityService.resolveSubject()` devuelve solamente `affiliateId`, `issuer` y `verifiedAt`. No busca por documento, nombre, teléfono, correo o número de afiliado. La ausencia de proveedor, issuer o vínculo produce un fallo cerrado.

`linkVerifiedSubject()` es una operación interna de aprovisionamiento y no está expuesta por ningún controller. Solo un flujo posterior, autenticado contra el núcleo externo real y con auditoría aprobada, podrá invocarla. Repetir el mismo vínculo es idempotente; intentar una reasignación implícita genera conflicto.

## Límites deliberados de ETAPA 1

- No se conecta todavía la experiencia Bingo autenticada.
- No se instala ni simula un adaptador del núcleo externo.
- No se crea un endpoint administrativo para vincular o reasignar identidades.
- No se usa el estado `Affiliate.status` como parte de la resolución. Estado y elegibilidad son decisiones de dominio posteriores y permanecen separados de identidad.
- No se implementa una operación de cambio/revocación. Si el negocio la requiere, deberá ser un flujo explícito, autorizado y auditado; nunca una actualización silenciosa.

## Configuración operativa futura

Cuando se instale el adaptador HTTP real, además de sus credenciales deberán definirse `EXTERNAL_CORE_IDENTITY_ISSUER` con un identificador estable y `EXTERNAL_IDENTITY_HMAC_KEY` con al menos 32 caracteres desde el almacén de secretos. Cambiar el issuer crea un espacio de identidad distinto y requiere aprovisionar vínculos verificados para el nuevo issuer.

La rotación de `EXTERNAL_IDENTITY_HMAC_KEY` requerirá un procedimiento de re-huella controlado a partir de la autoridad externa; no debe rotarse sin ese runbook porque ASODEF no almacena el sujeto en claro para reconstruir las huellas localmente. La separación permite rotar `ENCRYPTION_KEY` sin invalidar estos vínculos.
