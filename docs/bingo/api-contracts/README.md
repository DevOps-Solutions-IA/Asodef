# Bingo API contracts v1

Estado: contrato previo a integración. Estos archivos no registran rutas, no
ejecutan mutaciones y no se presentan como un backend funcional.

## Convenciones verificadas de ASODEF

- API NestJS con prefijo `/api/v1`.
- Autenticación administrativa mediante cookie `asodef_at` y guards globales.
- Autorización administrativa mediante `@RequirePermissions`.
- Validación global `whitelist`, `forbidNonWhitelisted` y `transform`.
- Errores normalizados por `GlobalExceptionFilter` con `requestId`.
- Autoservicio de afiliados mediante cookie de sesión, OTP, scopes y CSRF.
- `subjectRef` se resuelve mediante `AffiliateExternalIdentity`; los casos de
  uso Bingo reciben el `Affiliate.id`, `identityId` e issuer ya verificados.

## Superficies

### Administrativa

Base propuesta: `/api/v1/admin/bingo`.

Los recursos contractuales cubren eventos, rondas, patrones, premios,
participantes, cartones, asignaciones, ejecuciones, draws, candidatos,
ganadores, auditoría y estado de reportes. Cada mutación declarada requiere
`Idempotency-Key`; el actor procede exclusivamente de la sesión administrativa.

Los DTO de entrada enumeran campos admitidos. No existe un `metadata` abierto,
un payload Prisma genérico ni campos de actor/estado que permitan mass
assignment.

### Afiliado

Base propuesta: `/api/v1/self-service/affiliate/bingo`.

Los contratos solo permiten listar los eventos del afiliado, sus cartones, el
detalle de un cartón, el estado de ronda y su historial permitido. Ninguna ruta
acepta documento, teléfono, código de afiliado o `subjectRef`. El repositorio
de lectura futuro deberá incluir siempre `affiliateId` en su filtro, incluso
cuando el recurso tenga un UUID no enumerable.

### Pública

Base propuesta: `/api/v1/public/bingo/events/:eventSlug`.

Solo existen contratos de lectura. Los DTO públicos utilizan allowlist y no
incluyen IDs internos, PII, actores ni seed secreta. Un nombre ganador, cuando
la política lo autorice, debe llegar ya parcialmente anonimizado. La semilla
revelada es opcional y solo puede incorporarse tras el estado de revelación
oficial; antes de ese punto se exponen únicamente versión pública del protocolo
y commitment. El hash interno de configuración queda reservado a evidencia
administrativa explícita.

## Dependencias pendientes

La conexión a handlers queda bloqueada hasta integrar ETAPA 5. Los contratos
deben contrastarse entonces con los resultados reales de application, sin
adaptadores que inventen estados o respuestas. Los controllers reales y el
registro en `AppModule` pertenecen a ETAPAS 6-8.
