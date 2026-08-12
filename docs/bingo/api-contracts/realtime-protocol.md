# Contrato realtime Bingo v1

Estado: protocolo preparado; no hay publisher Redis ni endpoint SSE activo en
esta macrofase.

## Fuente y secuencia

PostgreSQL/outbox es la fuente autoritativa. Cada stream posee una secuencia
monótona y cada envelope contiene `id`, `type`, `stream`, `sequence`,
`occurredAt`, `surface` y `data` allowlisted. Los nombres de evento terminan en
`.v1`; un cambio incompatible crea `.v2`.

`Last-Event-ID` identifica el último evento aplicado. El cliente también
mantiene la última secuencia:

- secuencia menor o igual: duplicado, se ignora;
- secuencia exactamente siguiente: se aplica;
- gap o stream diferente: `RESYNC_REQUIRED` y recuperación por snapshot REST.

El snapshot devuelve estado actual y `lastSequence`. Tras aplicarlo, el cliente
reabre SSE desde ese cursor. Esto permite recuperarse de pérdida de Pub/Sub,
reinicio de proceso y retención limitada del replay buffer.

## Superficies

- `PUBLIC`: solo evento público, sin autenticación, sin PII/candidate/card
  layout.
- `AFFILIATE`: sesión de autoservicio de afiliado, identidad resuelta a
  `Affiliate.id`; la autorización del stream es por participación.
- `ADMIN`: sesión administrativa y permiso específico.

Nunca se reutiliza un stream privilegiado para clientes públicos filtrando en
el navegador. El servidor produce payloads distintos por superficie.

## Datos prohibidos

Documento, teléfono, correo, dirección, `subjectRef`, IDs de identidad/afiliado
y seed no revelada están prohibidos. El contrato contiene una comprobación
recursiva defensiva y pruebas de regresión. La seguridad principal seguirá
siendo una proyección allowlist desde el outbox, no un spread de Prisma.

## Publicación posterior

ETAPA 9 conectará outbox → publisher → Redis → procesos API → SSE. Redis será
fan-out, nunca fuente de verdad. Polling solo podrá ser fallback controlado al
snapshot REST.

