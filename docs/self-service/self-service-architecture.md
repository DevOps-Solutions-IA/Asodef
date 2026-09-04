# Arquitectura de autoservicio ASODEF

Estado: adaptador Master de solo lectura implementado; acceso temporal por lookup habilitado para no detener la integración; OTP preparado para WhatsApp Cloud API y aplazado hasta provisionar plantilla/token.

## Dominios de acceso

- Administración: `/iniciar-sesion`, correo corporativo, contraseña, MFA y RBAC existentes. No concede una sesión de autoservicio.
- Afiliados y titulares: `/mi-cuenta/acceso`, número de titular o tipo y número de documento.
- Empresas: `/empresa/acceso`, NIT registrado.

Los accesos públicos comparten `PublicHeader`. Los portales verificados usan shells propios. El Centro Legal mantiene su layout congelado.

## Flujo de acceso actual y OTP futuro

1. El BFF consulta `ExternalCoreProvider`; el navegador nunca llama al sistema externo.
2. Mientras `SELF_SERVICE_MESSAGE_PROVIDER=not_configured`, un lookup válido crea una sesión corta con garantía `LOOKUP`, ligada al navegador y separada de las sesiones administrativas.
3. La sesión `LOOKUP` mantiene las operaciones ordinarias aprobadas para esta fase: lectura, actualización de contacto/perfil y quote/aplicación de pagos. Cambios de beneficiarios y carga de documentos sensibles permanecen reservados para OTP.
4. Cuando WhatsApp OTP se active, el proveedor entregará canales habilitados, verificados y autorizados. Los destinos completos se conservarán cifrados solo en backend; la respuesta pública contendrá únicamente máscaras.
5. ASODEF generará el OTP con aleatoriedad criptográfica, almacenará solo su hash y lo entregará mediante `SelfServiceMessageProvider`. El transporte preparado para autoservicio es WhatsApp Cloud API mediante una plantilla `AUTHENTICATION` aprobada.
6. Tanto `LOOKUP` como `OTP` crean cookies opacas independientes por portal, `HttpOnly`, `SameSite=Strict`, `Secure` en producción y con vigencia corta. Las mutaciones autorizadas exigen alcance, idempotencia y token CSRF rotatorio de un solo uso.

Las respuestas de lookup son anti-enumeración: salvo autorización explícita del proveedor, “no existe” y “no disponible” no se distinguen ante el navegador.

## Contrato externo

`ExternalCoreProvider` cubre consulta inicial, canales, afiliación, beneficiarios, estado de cuenta, obligaciones, pagos, comprobantes, documentos, solicitudes, empresas, contratos, reportes, cambios de beneficiarios, aplicación de pagos y actualización de contactos. El adaptador Master actual ejecuta únicamente consultas aprobadas con `ASODEF_READONLY`; las escrituras permanecen fuera de ese canal hasta disponer de un mecanismo legado certificado.

El estado de cuenta del afiliado se deriva exclusivamente de los contratos y del conjunto de cuotas pagables certificado: saldo vencido positivo más la cuota vigente (la fecha no vencida más temprana, incluyendo empates). Los pagos parciales usan únicamente el `SALDO` restante y los importes se convierten a centavos COP sin punto flotante.

El Centro de Pagos también revalida las obligaciones Master contra esa misma autoridad antes de cualquier paso futuro de checkout. La selección enviada al navegador es opaca y no constituye prueba del valor financiero; el backend vuelve a leer Firebird antes del preflight.

## Actualización de contacto

La interfaz y los scopes permiten continuar el flujo de actualización aun cuando WhatsApp OTP esté aplazado. Sin embargo, el adaptador Master de producción sigue siendo de solo lectura: un cambio solo podrá mostrarse como aplicado cuando un futuro write bridge certificado confirme `APPLIED`. No se ejecutan `UPDATE`, `INSERT` o `DELETE` arbitrarios contra Firebird.

Cuando OTP se active, la verificación por WhatsApp podrá elevar el mismo flujo sin alterar la autoridad de datos ni la separación de capas.

## Endpoints

Namespace: `/api/v1/self-service`.

- `affiliate|company/access/start`, `request-code`, `resend`, `verify`.
- `affiliate|company/session` (`GET`, `DELETE`).
- recursos de afiliado y empresa bajo su portal correspondiente.
- ciclo `affiliate/beneficiary-change-requests` (mutaciones sensibles reservadas para OTP y además sujetas al proveedor legado).
- `affiliate/contact-updates/start|request-code|verify|:requestId/status`.
- `payments/quote|apply-confirmed|application/:id`. La reversa no forma parte del autoservicio del cliente.
- `provider-health`.

El Centro de Pagos público añade `POST /api/v1/payment-orders/master/preflight` para revalidar una obligación Master sin crear una orden ni iniciar Bold mientras la aplicación al legado no esté certificada.

Los controladores están agrupados en Swagger de desarrollo. Los secretos se suministran únicamente desde el gestor de configuración del entorno.

## Variables documentadas

`EXTERNAL_CORE_PROVIDER`, `EXTERNAL_CORE_TIMEOUT_MS`, `SELF_SERVICE_MESSAGE_PROVIDER`, `SELF_SERVICE_SESSION_TTL_MINUTES`, `SELF_SERVICE_OTP_TTL_MINUTES`, `SELF_SERVICE_OTP_MAX_ATTEMPTS`, `SELF_SERVICE_OTP_COOLDOWN_SECONDS`, `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_OTP_TEMPLATE_NAME`, `WHATSAPP_OTP_TEMPLATE_LANGUAGE` y `WHATSAPP_TIMEOUT_MS`.

## Límites reales

El adaptador Master existe y permanece limitado a lectura. WhatsApp OTP no se considera operativo hasta que la plantilla `AUTHENTICATION` esté aprobada y el token/Phone Number ID se provisionen por canal secreto. La ausencia temporal de OTP no deshabilita las funciones ordinarias definidas por scopes, pero cualquier operación que requiera escritura real en el legado continúa fallando cerrada hasta que exista un write bridge certificado e idempotente.
