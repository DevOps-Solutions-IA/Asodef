# Cierre de experiencia pública flagship ASODEF

Fecha de verificación: 2026-08-06 (America/Bogota)  
Fase: US-110–US-125  
Baseline: `master` · `de0e5bc5e8d1fe8bc8cf55c603027ed863d7a6dc`

## Resultado

La experiencia pública evolucionó de una portada extensa con navegación por anclas a una arquitectura institucional tipada y orientada por audiencia, necesidad y resultado. La solución conserva logo, paleta, tipografía, tokens, componentes, portales, pagos Bold, Centro Legal y flujos especializados existentes. No se añadieron servicios, cifras, precios, testimonios, coberturas ni garantías no sustentadas.

El recorrido principal conecta Inicio, identidad institucional, ocho categorías de beneficio documentadas, soluciones para cuatro audiencias, recursos y un orientador condicional. Cuando corresponde, el orientador crea un lead real, clasificado e idempotente; almacena origen y UTM; y registra consentimientos separados contra la versión legal publicada exacta. Pagos, PQR y solicitudes de datos conservan sus flujos especializados y no duplican captura.

## Hallazgos corregidos

- Se reemplazaron anclas y scaffolding por páginas de decisión completas, sin romper alias históricos.
- Se eliminó la dependencia de animaciones `whileInView` con contenido inicialmente invisible.
- Se sustituyeron claims genéricos y categóricos por procesos, límites y resultados verificables.
- Se separó “beneficios” (valor disponible) de “soluciones” (recorrido por perfil).
- El formulario público rígido dejó de ser la única entrada: el orientador minimiza datos y ramifica por necesidad.
- CRM recibió clasificación, ruta de entrada, fuente, campaña, preferencia e idempotencia.
- SEO dejó de depender de un único conjunto de tags: cada ruta tiene metadata, canonical y datos estructurados válidos.
- La navegación pública ahora agrupa conocer, gestionar y consultar; conserva foco, Escape, scroll y restauración en móvil.
- Se corrigió un defecto del orientador que ocultaba el botón de avance en ramas de derivación directa.

## Arquitectura y contenido

Los registros tipados de rutas, navegación, beneficios y audiencias constituyen la fuente única para páginas, enlaces, sitemap y metadata. El sistema editorial define voz, terminología, CTA, microcopy, errores, consentimientos y reglas SEO. Los ocho beneficios provienen del dossier institucional y se redactaron con revelación limitada cuando una condición depende de la relación específica.

Las redirecciones `/portafolio`, `/cobertura`, `/legal/pqr` y `/legal/solicitudes-de-datos` preservan los parámetros de búsqueda y evitan bucles. `/login` conserva el acceso compatible hacia `/iniciar-sesion`.

## Funnel, CRM y evidencia

Las ramas iniciales son persona, afiliado/usuario, representante de empresa, potencial aliado, soporte de pago, PQR, solicitud de datos y orientación general. Pago, PQR y datos personales derivan al canal real. Las ramas de orientación recogen únicamente necesidad, identidad/contacto y datos organizacionales pertinentes, permiten revisión y exigen autorización de tratamiento. Correo, WhatsApp y comunicaciones comerciales permanecen opcionales e independientes.

`POST /api/v1/leads/guided` aplica esquema compartido, validación autoritativa, límite de tasa, honeypot, clave de idempotencia y transacción. El lead conserva `source`, `entryRoute`, `audience`, `need`, `preferredContact`, campaña UTM y payload minimizado. Cada aceptación persiste su propósito y el identificador de la versión legal vigente; el flujo de revocación existente no se altera.

## SEO, accesibilidad y rendimiento

Se implementaron títulos y descripciones únicos, canonical, Open Graph, Twitter, sitemap generado desde registros, robots, `Organization`, `WebSite`, breadcrumbs, FAQ solo con preguntas visibles y `Service` sin precios/reseñas fabricadas. La limitación de metadata cliente en una SPA Vite está documentada en `seo-implementation.md`; no se presenta como SSR.

La verificación cubrió lectura semántica, encabezado principal, controles etiquetados, navegación de teclado, gestión/restauración de foco, Escape, reduced motion y orden responsive. El build mantiene un bundle principal de aproximadamente 703 kB minificado (188 kB gzip), por encima del aviso de 500 kB de Vite: es un riesgo de rendimiento conocido, no un error funcional. No se añadió otro framework visual ni imágenes pesadas al hero.

## Evidencia de calidad

- Backend: 83 suites y 773 pruebas aprobadas.
- Frontend: 69 archivos y 380 pruebas aprobadas.
- E2E integral: 30 de 30 aprobadas en Chromium.
- E2E flagship: 8 de 8 aprobadas; 29 rutas por cada una de 6 resoluciones, las ocho páginas de beneficio, ramas directas, 404 semántico y persistencia CRM/consentimientos.
- Lint, TypeScript estricto y build de producción: aprobados.
- Migración `20260806070000_guided_public_funnel`: aplicada y estado al día.
- Seed: dos ejecuciones consecutivas aprobadas.
- Docker: reconstrucción sin caché y runtime healthy.
- Evidencia visual ignorada: `test-results/**/home-{wide,desktop,compact,tablet,mobile,small}.png`.

## Cobertura ruta por ruta

“A11y/RWD” significa que la ruta fue recorrida en Chromium a 1440, 1280, 1024, 768, 390 y 360 px, con `h1` visible, sin overflow horizontal, errores de página, errores inesperados de consola ni respuestas HTTP inesperadas.

| Ruta | Audiencia | Objetivo | CTA principal | Backend | Consentimiento | SEO | A11y/RWD | Pruebas | Commit |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Todas | Comprender el ecosistema y elegir ruta | Encontrar mi ruta | Registros y destinos reales | En el paso pertinente | Organization/WebSite + metadata | Verificado | home, content, E2E | `3283728` |
| `/quienes-somos` | Todas | Verificar identidad, propósito y operación | Encontrar mi ruta | Configuración y publicaciones reales | No recolecta datos | Breadcrumb + metadata | Verificado | about, E2E | `508a6ed` |
| `/beneficios` | Personas, afiliados, empresas, aliados | Filtrar el portafolio documentado | Ver categoría | Registro tipado | No recolecta datos | Breadcrumb + metadata | Verificado | benefits hub, E2E | `1037ea4` |
| `/beneficios/plan-exequial-familiar` | Personas y afiliados | Orientación exequial aplicable | Consultar orientación | Funnel/portales | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/beneficios/seguro-de-vida` | Personas y afiliados | Consultar protección vinculada | Consultar orientación | Funnel/portales | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/beneficios/asesoria-juridica` | Personas y afiliados | Ubicar orientación jurídica | Consultar orientación | Funnel/PQR | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/beneficios/movilidad` | Personas y afiliados | Explorar alternativas de movilidad | Consultar orientación | Funnel | En funnel | Service + FAQ + breadcrumb | Verificado directo | benefit detail, E2E | `eb778a9` |
| `/beneficios/salud-y-bienestar` | Personas y afiliados | Explorar categorías de bienestar | Consultar orientación | Funnel | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/beneficios/educacion` | Personas y afiliados | Consultar alternativas educativas | Consultar orientación | Funnel | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/beneficios/convenios-comerciales` | Todas | Descubrir categorías comerciales | Consultar orientación | Funnel/CRM | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/beneficios/categorias-complementarias` | Personas, afiliados y aliados | Consultar categorías complementarias | Consultar orientación | Funnel/CRM | En funnel | Service + FAQ + breadcrumb | Verificado | benefit detail, registry | `eb778a9` |
| `/soluciones` | Todas | Elegir recorrido por perfil | Ver solución | Registro tipado | No recolecta datos | Breadcrumb + metadata | Verificado | solutions, E2E | `28ad578` |
| `/soluciones/personas` | Personas y familias | Orientar beneficio, pago o solicitud | Comenzar | Funnel/pagos/PQR/DSR | Según acción | FAQ + breadcrumb | Verificado directo | audience, E2E | `28ad578` |
| `/soluciones/afiliados` | Afiliados y usuarios | Acceder a cuenta, beneficios y pagos | Ir a Mi cuenta | Auth/portal/pagos | Versionado en acciones | FAQ + breadcrumb | Verificado directo | audience, E2E | `28ad578` |
| `/soluciones/empresas` | Representantes | Iniciar o gestionar relación empresarial | Evaluar necesidad | Funnel/CRM/portal | Obligatorio + opcionales | FAQ + breadcrumb | Verificado directo | audience, E2E | `28ad578` |
| `/soluciones/aliados` | Potenciales aliados | Registrar interés evaluable | Presentar interés | Funnel/CRM | Obligatorio + canales opcionales | FAQ + breadcrumb | Verificado directo | claim guard, E2E | `23a6254` |
| `/empresas` | Empresas | Explicar relación y acceso empresarial | Comenzar evaluación | Funnel/CRM/portal | En funnel | Breadcrumb + metadata | Verificado | routes, E2E | `8fcbf4f` |
| `/pagos` | Pagadores | Consultar y continuar pago seguro | Consultar pago | API pagos/Bold | Versiones exactas existentes | Metadata/no falsas ofertas | Verificado | suite pagos, E2E | `8fcbf4f` |
| `/recursos` | Todas | Descubrir canales de gestión | Elegir recurso | Pagos/PQR/DSR/legal | En cada flujo | Breadcrumb + metadata | Verificado | routes, E2E | `8fcbf4f` |
| `/recursos/preguntas-frecuentes` | Todas | Resolver dudas verificables | Encontrar mi ruta | Destinos reales | No recolecta datos | FAQ + breadcrumb | Verificado | SEO, E2E | `0a38189` |
| `/contacto` | Todas | Elegir contacto con resultado trazable | Comenzar orientación | Funnel/lead | En funnel | Breadcrumb + metadata | Verificado | routes, E2E | `78397ec` |
| `/comenzar` | Todas | Orquestar el siguiente paso | Continuar/confirmar | `/leads/guided`, pagos, PQR, DSR | Versiones exactas y canales separados | noindex transaccional | Verificado directo | funnel unit, API, E2E | `45c98a0` |
| `/legal` | Todas | Consultar documentos vigentes | Ver documento | API legal | No recolecta datos | Breadcrumb + metadata | Verificado | legal suite, E2E | `8fcbf4f` |
| `/legal/:slug` | Todas | Leer una versión institucional | Imprimir/relacionados | API legal versionada | Documento fuente de evidencia | Breadcrumb + metadata | Verificado con privacidad | legal suite, E2E | `8fcbf4f` |
| `/pqr` | Solicitantes | Radicar o consultar PQR | Radicar PQR | API PQR | Política y tratamiento vigentes | Metadata recurso | Verificado | PQR suite, guided branch, E2E | `78397ec` |
| `/solicitudes-de-datos` | Titulares | Ejercer derechos de datos | Iniciar solicitud | API DSR | Procedimiento y tratamiento vigentes | Metadata recurso | Verificado | DSR suite, guided branch, E2E | `78397ec` |
| `/iniciar-sesion` | Usuarios autorizados | Autenticarse | Ingresar | API auth/RBAC | No crea marketing | noindex | Verificado | auth suite, E2E | `be8c74d` |
| `/mi-cuenta` | Afiliados autenticados | Acceder al portal personal | Ingresar | Auth/portal | Mis consentimientos | noindex | Handoff verificado | auth/portal/E2E existente | `8fcbf4f` |
| `/empresa` | Representantes autorizados | Acceder al portal empresarial | Ingresar | Auth/RBAC/portal | Términos versionados | noindex | Handoff verificado | auth/company/E2E existente | `8fcbf4f` |
| `*` (404) | Todas | Recuperarse de una ruta inexistente | Volver al inicio | Sin llamada de negocio | No recolecta datos | Fallback controlado | `h1` y RWD verificados | router, E2E | cierre QA |

## Redirecciones compatibles

| Origen | Destino | Parámetros | Prueba | Commit |
|---|---|---|---|---|
| `/portafolio` | `/beneficios` | Preservados | redirect compatibility | `78397ec` |
| `/cobertura` | `/quienes-somos#operacion` | Preservados | redirect compatibility | `78397ec` |
| `/legal/pqr` | `/pqr` | Preservados | redirect compatibility | `78397ec` |
| `/legal/solicitudes-de-datos` | `/solicitudes-de-datos` | Preservados | redirect compatibility | `78397ec` |
| `/login` | `/iniciar-sesion` | Compatible | auth/navigation | `be8c74d` |

## Estado operativo final

Frontend: `http://localhost:8080`  
API: `http://localhost:3200`  
PostgreSQL: `asodef-postgres-1` healthy  
Redis: `asodef-redis-1` healthy  
Despliegue: no  
Push: no  
Cambios de producción: no
