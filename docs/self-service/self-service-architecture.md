# Arquitectura de autoservicio ASODEF

Estado: adaptador Master de solo lectura implementado; OTP preparado para WhatsApp Cloud API y cerrado por defecto hasta provisionar plantilla/token.

## Dominios de acceso

- Administración: `/iniciar-sesion`, correo corporativo, contraseña, MFA y RBAC existentes. No concede una sesión de autoservicio.
- Afiliados y titulares: `/mi-cuenta/acceso`, número de titular o tipo y número de documento.
- Empresas: `/empresa/acceso`, NIT registrado.

Los accesos públicos comparten `PublicHeader`. Los portales verificados usan shells propios. El Centro Legal mantiene su layout congelado.

## Flujo de verificación

1. El BFF consulta `ExternalCoreProvider`; el navegador nunca llama al sistema externo.
2. El proveedor entrega canales habilitados, verificados y autorizados. Los destinos completos se conservan cifrados solo en backend; la respuesta pública contiene únicamente máscaras.
3. ASODEF genera el OTP con aleatoriedad criptográfica, almacena solo su hash y lo entrega mediante `SelfServiceMessageProvider`. El transporte configurado para autoservicio es WhatsApp Cloud API mediante una plantilla `AUTHENTICATION` aprobada.
4. El desafío queda ligado al identificador derivado, portal, canal, IP, agente de usuario y vencimiento. Tiene enfriamiento, máximo de intentos, bloqueo y consumo único.
5. Una validación correcta crea una cookie opaca independiente por portal, `HttpOnly`, `SameSite=Strict`, `Secure` en producción y con vigencia corta.
6. Las mutaciones exigen alcance, nivel de garantía OTP, idempotencia y un token CSRF rotatorio de un solo uso.

Las respuestas de lookup son anti-enumeración: salvo autorización explícita del proveedor, “no existe” y “no disponible” no se distinguen ante el navegador.

## Contrato externo

`ExternalCoreProvider` cubre consulta inicial, canales, afiliación, beneficiarios, estado de cuenta, obligaciones, pagos, comprobantes, documentos, solicitudes, empresas, contratos, reportes, cambios de beneficiarios, aplicación de pagos y actualización de contactos. El adaptador Master actual ejecuta únicamente consultas aprobadas con `ASODEF_READONLY`; las escrituras permanecen fuera de ese canal.

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
- `payments/quote|apply-confirmed|application/:id`. La reversa no forma parte del autoservicio del cliente.
- `provider-health`.

Los controladores están agrupados en Swagger de desarrollo. Los secretos se suministran únicamente desde el gestor de configuración del entorno.

## Variables documentadas

`EXTERNAL_CORE_PROVIDER`, `EXTERNAL_CORE_TIMEOUT_MS`, `SELF_SERVICE_MESSAGE_PROVIDER`, `SELF_SERVICE_SESSION_TTL_MINUTES`, `SELF_SERVICE_OTP_TTL_MINUTES`, `SELF_SERVICE_OTP_MAX_ATTEMPTS`, `SELF_SERVICE_OTP_COOLDOWN_SECONDS`, `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_OTP_TEMPLATE_NAME`, `WHATSAPP_OTP_TEMPLATE_LANGUAGE` y `WHATSAPP_TIMEOUT_MS`.

## Límites reales

El adaptador Master existe y permanece limitado a lectura. WhatsApp OTP no se considera operativo hasta que la plantilla `AUTHENTICATION` esté aprobada y el token/Phone Number ID se provisionen por canal secreto. Capacidades de escritura sin regla aprobada continúan fallando cerradas.
