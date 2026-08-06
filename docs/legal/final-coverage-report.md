# Reporte final de cobertura legal

Fecha de cierre local: 2026-08-05 (America/Bogota).

Reconciliación final: **21 documentos institucionales** en catálogo y PostgreSQL, **21 versiones 2 vigentes**, **0 documentos materialmente bloqueados**, **0 placeholders vigentes** y **2 fixtures sintéticos archivados fuera del descubrimiento público**. La tabla contiene exactamente las 21 entradas institucionales; los fixtures se informan por separado.

Abreviaturas de fuentes: **CEC** certificado vigente de Cámara de Comercio; **DOS** dossier institucional; **CON** contrato escaneado usado únicamente para categorías de datos; **APP** esquema, módulos, rutas, formularios y comportamiento verificado; **CFG** configuración corporativa tipada; **IMG** pieza institucional usada como evidencia de canal. La propuesta PISCO no se utilizó para afirmar proveedor, precio, garantía o condición contractual.

| documento | slug | historia correctiva | fuentes utilizadas | placeholders antes | placeholders después | versión anterior | versión nueva | estado final | ruta pública | integraciones | pruebas | commit |
|---|---|---|---|---:|---:|---|---|---|---|---|---|---|
| Información empresarial | informacion-empresarial | US-081 | CEC, DOS, CFG | 0 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/informacion-empresarial` | footer, contacto, metadatos | catálogo, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Política de privacidad | politica-de-privacidad | US-082 | CEC, DOS, CON, APP, CFG | 4 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/politica-de-privacidad` | contacto, cuenta, pagos, PQR, DSR, portales | catálogo, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Política de tratamiento de datos personales | tratamiento-de-datos | US-082 | CEC, CON, APP, CFG | 5 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/tratamiento-de-datos` | formularios con datos personales | catálogo, consentimiento, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Aviso de privacidad | aviso-de-privacidad | US-082 | CEC, APP, CFG | 4 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/aviso-de-privacidad` | contacto, PQR | catálogo, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Autorización general de tratamiento | autorizacion-general-de-tratamiento | US-083 | CEC, CON, APP, CFG | 4 | 0 | v1 APPROVED | v2 | PUBLISHED | `/legal/autorizacion-general-de-tratamiento` | consent records, formularios | workflow, historial, consentimiento, API, Chromium | 7579796, 68628d2, 050466f |
| Consentimiento para WhatsApp | consentimiento-whatsapp | US-083 | DOS, IMG, APP, CFG | 2 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/consentimiento-whatsapp` | CRM, comunicaciones, revocación | catálogo, consentimiento, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Consentimiento para correo electrónico | consentimiento-correo-electronico | US-083 | APP, CFG | 2 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/consentimiento-correo-electronico` | CRM, comunicaciones | catálogo, consentimiento, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Consentimiento de comunicaciones comerciales | consentimiento-comunicaciones-comerciales | US-083 | DOS, IMG, APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/consentimiento-comunicaciones-comerciales` | contacto, CRM, marketing, supresión | no-bundling, revocación, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Tratamiento de datos sensibles | tratamiento-datos-sensibles | US-083 | CON, APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/tratamiento-datos-sensibles` | afiliación, beneficiarios, DSR | catálogo, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Tratamiento de menores y beneficiarios | tratamiento-menores-y-beneficiarios | US-083 | CON, APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/tratamiento-menores-y-beneficiarios` | contratos, afiliación, beneficiarios | catálogo, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Términos y condiciones de uso | terminos-y-condiciones | US-084 | CEC, APP, CFG | 9 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/terminos-y-condiciones` | cuenta, autenticación, contratos, pagos | RBAC, catálogo, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Condiciones del portal empresarial | condiciones-portal-empresarial | US-084 | DOS, APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/condiciones-portal-empresarial` | `/empresa`, empresas, contratos, comunicaciones | RBAC, portal, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Condiciones del portal de usuario o afiliado | condiciones-portal-afiliado | US-084 | DOS, CON, APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/condiciones-portal-afiliado` | `/mi-cuenta`, pagos, consentimientos | RBAC, portal, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Términos de pago | terminos-de-pago | US-085 | APP, CFG | 4 | 0 | v1 PUBLISHED, ahora REPLACED | v2 | PUBLISHED | `/legal/terminos-de-pago` | `/pagos`, órdenes, recibos, versión aceptada | workflow, pagos, consentimiento, API, Chromium | 7579796, 68628d2, 050466f |
| Reversiones, devoluciones y reembolsos | reversiones-y-reembolsos | US-085 | APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/reversiones-y-reembolsos` | refunds, reversals, payments, conciliación | refunds, DB, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Política y procedimiento de PQR | pqr | US-086 | APP, CFG | 2 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/pqr` | formulario PQR, administración PQR | integración, consentimiento, E2E, Chromium | 7579796, 68628d2, 050466f |
| Procedimiento de consultas y reclamos de titulares | procedimiento-consultas-y-reclamos | US-086 | APP, CFG | 2 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/procedimiento-consultas-y-reclamos` | formulario DSR, administración DSR | integración, consentimiento, API, Chromium | 7579796, 68628d2, 050466f |
| Política de cookies | politica-de-cookies | US-087 | APP, CFG | 3 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/politica-de-cookies` | banner, preferencias, sesión | cookies reales, consentimiento, API, Chromium | 7579796, 68628d2, 050466f |
| Política de seguridad de la información | seguridad | US-087 | APP, CFG | 2 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/seguridad` | auth, RBAC, auditoría, exportaciones | seguridad, RBAC, API, UI, Chromium | 7579796, 68628d2, 050466f |
| Declaración de accesibilidad | accesibilidad | US-087 | APP, CFG | 2 | 0 | v1 PUBLISHED, ahora REPLACED | v2 | PUBLISHED | `/legal/accesibilidad` | rutas públicas, canal de barreras | foco, reduced-motion, 1440/768/390, Chromium | 7579796, 68628d2, 050466f |
| Política de comunicaciones electrónicas | politica-comunicaciones-electronicas | US-088 | CEC, DOS, IMG, APP, CFG | 1 | 0 | v1 DRAFT | v2 | PUBLISHED | `/legal/politica-comunicaciones-electronicas` | comunicaciones, CRM, contratos, supresión | transaccional/comercial, API, UI, Chromium | 7579796, 68628d2, 050466f |

## Tratamiento de documentos sintéticos

| slug | identificación | estado inicial | tratamiento final | evidencia preservada | prueba | commit |
|---|---|---|---|---|---|---|
| consent-test-doc-17075160-e7df-490a-bbe6-90be76c38873 | Fixture confirmado por prefijo, título, tipo y origen de prueba; no pertenece al catálogo | PUBLISHED, sin currentVersionId | ARCHIVED; currentVersionId nulo; API pública 404; ausente de `/legal` | Auditoría de archivo | DB, API y Chromium | 7579796, 050466f |
| consent-test-doc-a3cde1ff-18b3-4e08-99b1-42039a69b5cc | Fixture confirmado por prefijo, título, tipo y origen de prueba; no pertenece al catálogo | PUBLISHED, sin currentVersionId | ARCHIVED; currentVersionId nulo; API pública 404; ausente de `/legal` | Una referencia de consentimiento y auditoría preservadas | DB, API y Chromium | 7579796, 02d545d, 050466f |

## Evidencia de cierre

- PostgreSQL: 21 filas institucionales con `current_version_id` apuntando a v2 `PUBLISHED`; cero coincidencias vigentes de marcadores conocidos; dos fixtures `ARCHIVED`; cero migraciones pendientes.
- API pública: 21/21 endpoints documentales responden contenido vigente; fixtures responden 404; health de base de datos y Redis en estado `ok`.
- Suites: backend 82/82 suites y 770/770 pruebas; frontend 62/62 archivos y 409/409 pruebas; E2E 19/19 en Chromium.
- Calidad: lint 7/7 tareas; typecheck 8/8 tareas; typecheck E2E limpio; build forzado 5/5 tareas sin caché.
- Infraestructura local: rebuild Docker sin caché realizado; API, web, PostgreSQL y Redis saludables; dos ejecuciones consecutivas de seed completadas sin alterar las versiones vigentes.
- Historias correctivas US-079 a US-098: `COMPLETE` 20, `BLOCKED` 0, `OPEN` 0, `PENDING` 0. US-038 a US-042 permanecen `DEFERRED — DEPLOYMENT NOT AUTHORIZED`.
