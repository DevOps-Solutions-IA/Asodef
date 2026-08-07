# Arquitectura de autoservicio ASODEF

Estado: implementada localmente, preparada para proveedor externo, cerrada por defecto (`NOT_CONFIGURED`).

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

El repositorio no contiene URL ni credenciales de producción ni datos sintéticos. El adaptador incluido devuelve `NOT_CONFIGURED`; seleccionar un adaptador no instalado detiene el arranque de forma explícita.

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

`EXTERNAL_CORE_PROVIDER`, `EXTERNAL_CORE_BASE_URL`, `EXTERNAL_CORE_CLIENT_ID`, `EXTERNAL_CORE_CLIENT_SECRET`, `EXTERNAL_CORE_TIMEOUT_MS`, `EXTERNAL_CORE_WEBHOOK_SECRET`, `SELF_SERVICE_MESSAGE_PROVIDER`, `SELF_SERVICE_SESSION_TTL_MINUTES`, `SELF_SERVICE_OTP_TTL_MINUTES`, `SELF_SERVICE_OTP_MAX_ATTEMPTS` y `SELF_SERVICE_OTP_COOLDOWN_SECONDS`.

## Límites reales

No existe todavía un adaptador ni credenciales del sistema externo. Por esa razón el runtime local muestra un estado controlado de proveedor no configurado y jamás fabrica afiliados, beneficiarios, saldos, pagos, empresas, OTP entregados o confirmaciones.
