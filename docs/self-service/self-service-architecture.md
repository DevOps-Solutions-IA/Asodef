# Arquitectura de autoservicio ASODEF

Estado: implementada localmente, cerrada por defecto (`NOT_CONFIGURED`) y con
un proveedor interno híbrido explícito (`EXTERNAL_CORE_PROVIDER=hybrid`).

## Dominios de acceso

- Administración: `/iniciar-sesion`, correo corporativo, contraseña, MFA y RBAC existentes. No concede una sesión de autoservicio.
- Afiliados y titulares: `/mi-cuenta/acceso`, número de titular o tipo y número de documento.
- Empresas: `/empresa/acceso`, NIT registrado.

Los accesos públicos comparten `PublicHeader`. Los portales verificados usan shells propios. El Centro Legal mantiene su layout congelado.

## Flujo de verificación

1. El BFF consulta `ExternalCoreProvider`; el navegador nunca llama al sistema externo.
2. El proveedor entrega canales habilitados, verificados y autorizados. Los destinos completos se conservan cifrados solo en backend; la respuesta pública contiene únicamente máscaras.
3. ASODEF genera el OTP con aleatoriedad criptográfica, almacena solo su hash y lo entrega mediante `SelfServiceMessageProvider`.
4. El desafío queda ligado al identificador derivado, portal, canal, IP, agente de usuario y vencimiento. Tiene enfriamiento, máximo de intentos, bloqueo y consumo único.
5. Una validación correcta crea una cookie opaca independiente por portal, `HttpOnly`, `SameSite=Strict`, `Secure` en producción y con vigencia corta.
6. Las mutaciones exigen alcance, nivel de garantía OTP, idempotencia y un token CSRF rotatorio de un solo uso.

Las respuestas de lookup son anti-enumeración: salvo autorización explícita del proveedor, “no existe” y “no disponible” no se distinguen ante el navegador.

## Contrato externo

`ExternalCoreProvider` cubre consulta inicial, canales, afiliación, beneficiarios, estado de cuenta, obligaciones, pagos, comprobantes, documentos, solicitudes, empresas, contratos, reportes, cambios de beneficiarios, aplicación/reversión de pagos y actualización de contactos. El registro de proveedor expone estado de salud estable.

El repositorio no contiene URL ni credenciales de producción ni datos
sintéticos. El adaptador híbrido conserva PostgreSQL como autoridad de los
dominios digitales y usa Firebird exclusivamente mediante
`MasterQueryService`. Las operaciones sin semántica aprobada devuelven un
fallo cerrado. El adaptador `NOT_CONFIGURED` continúa siendo el default y
seleccionar el futuro modo HTTP sin adaptador detiene el arranque.

La identidad inicial puede verificarse contra Master, pero no se consideran
verificados ni autorizados los teléfonos, WhatsApp o correos solo por estar
presentes. Hasta que exista esa semántica, el provider híbrido no entrega
canales OTP y el acceso público no progresa a sesión.

## Actualización sensible de contacto

La sesión OTP prueba primero el canal actualmente registrado. La persona informa el nuevo destino, ASODEF verifica ese nuevo destino con otro OTP y después solicita el cambio al core externo. Los estados `VERIFIED` y `SUBMITTED` no significan que el dato fue aplicado. Solo una confirmación `APPLIED` del proveedor permite mostrar el cambio como aplicado. Las notificaciones al destino anterior y al nuevo son fail-closed y requieren permisos operativos expresos del proveedor.

## Endpoints

Namespace: `/api/v1/self-service`.

- `affiliate|company/access/start`, `request-code`, `resend`, `verify`.
- `affiliate|company/session` (`GET`, `DELETE`).
- recursos de afiliado y empresa bajo su portal correspondiente.
- ciclo completo `affiliate/beneficiary-change-requests`.
- `affiliate/contact-updates/start|request-code|verify|:requestId/status`.
- `payments/quote|apply-confirmed|application/:id|reverse`.
- `provider-health`.

Los controladores están agrupados en Swagger de desarrollo. Los secretos se suministran únicamente desde el gestor de configuración del entorno.

## Variables documentadas

`EXTERNAL_CORE_PROVIDER` (`not_configured`, `hybrid` o el futuro `http`),
`EXTERNAL_CORE_BASE_URL`, `EXTERNAL_CORE_CLIENT_ID`,
`EXTERNAL_CORE_CLIENT_SECRET`, `EXTERNAL_CORE_TIMEOUT_MS`,
`EXTERNAL_CORE_WEBHOOK_SECRET`, `SELF_SERVICE_MESSAGE_PROVIDER`,
`SELF_SERVICE_SESSION_TTL_MINUTES`, `SELF_SERVICE_OTP_TTL_MINUTES`,
`SELF_SERVICE_OTP_MAX_ATTEMPTS` y `SELF_SERVICE_OTP_COOLDOWN_SECONDS`.

## Límites reales

El modo híbrido requiere que Master esté habilitado con su cuenta read-only.
No existen todavía semánticas aprobadas de canal OTP, beneficiarios, receipt
legacy ni cuotas Master pendientes. El runtime jamás fabrica esos datos ni
declara entrega/confirmación cuando los providers correspondientes no están
configurados.
