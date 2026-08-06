# Auditoría de experiencia pública ASODEF

Fecha: 2026-08-06 (America/Bogota)  
Baseline verificado: `master` · `de0e5bc5e8d1fe8bc8cf55c603027ed863d7a6dc`

## Estado comprobado

- Árbol rastreado limpio; existen `.claude/` y `docs/source/` sin seguimiento y no se modifican.
- No existe remoto Git configurado en la copia local. El repositorio GitHub informado por el usuario no se añadió porque esta fase no requiere push.
- Frontend `http://localhost:8080`, API `http://localhost:3200`, PostgreSQL y Redis: healthy.
- Health API: base de datos y Redis `ok`.
- PRD: US-099–US-109 completas. US-038–US-042 siguen abiertas/deferidas y fuera de esta fase.
- Base de datos: 23 identidades legales, 21 versiones institucionales publicadas, 10 leads, 798 evidencias de consentimiento, 22 empresas y 1 aliado.
- Chromium baseline: 1440, 768 y 390 px aprobado por la prueba existente, con hallazgos editoriales/visuales descritos abajo.

## Fuentes y límites

La experiencia pública puede sustentarse en el dossier institucional, certificado de Cámara de Comercio, configuración corporativa tipada, catálogo de contenido, modelos y comportamiento real. El dossier acredita historia institucional declarada, misión/visión, sede Cali, cobertura nacional declarada, 8.405 titulares, 54.692 beneficiarios y categorías de portafolio. El certificado acredita identidad, NIT, matrícula, fecha de registro, domicilio, actividad y vigencia.

No se trasladan al sitio precios, coberturas contractuales, carencias, garantías, vigencias, exclusiones ni condiciones individuales del formato de afiliación. La propuesta ERP de un tercero no prueba contratación ni capacidades productivas y no se usa como fuente de servicios. Los datos personales contenidos en documentos fuente no se publican.

## Arquitectura y navegación actuales

- La navegación principal mezcla rutas transaccionales con anclas largas de homepage.
- `/quienes-somos` y `/beneficios` redirigen a anclas; no son páginas de decisión independientes.
- `/empresas` muestra scaffolding sin resultado funcional.
- No existen `/soluciones`, `/recursos`, `/comenzar` ni páginas de beneficios.
- “Portafolio”, “Beneficios” y “Cifras” compiten como conceptos de primer nivel sin explicar la diferencia.
- El drawer móvil es accesible, pero presenta una lista plana y carece de agrupación por necesidad/audiencia.
- El CTA global “Conversemos” no anticipa el resultado y aterriza en un formulario empresarial obligatorio.
- `/pqr` redirige al flujo real, pero pierde potencialmente parámetros de campaña; no existe alias superior para solicitudes de datos.

## Contenido y precisión editorial

- Hay frases vagas o repetidas: “soluciones integrales”, “beneficios reales”, “atención cercana”, “acompañamiento institucional”, “bienestar” y “confianza” se reiteran sin explicar siempre el proceso.
- El hero comunica una intención general, pero no muestra la relación entre beneficios, pagos, solicitudes, empresas, consentimientos y portales.
- Los tres rótulos flotantes del hero son atributos abstractos, no rutas o acciones.
- “Nuevos clientes”, “difusión permanente”, “mayor fidelización” y “posicionamiento de marca” se presentan de forma demasiado categórica; deben expresarse como propuesta y capacidad, no garantía.
- “La red crece día a día” y “siempre cerca” son afirmaciones promocionales no necesarias.
- Historia, misión y visión están concentradas en tarjetas breves dentro de inicio; faltan gobierno, principios operativos, datos corporativos y relación entre audiencias.
- Varias categorías de beneficios solo ofrecen título, dos frases y un enlace genérico a contacto; no entregan valor suficiente para decidir.
- La página de pagos es funcional y confiable, pero queda aislada de la arquitectura de orientación pública.

## Integración funcional

- `POST /api/v1/leads` persiste un `LeadSubmission`, crea notificación y registra consentimiento obligatorio contra la versión publicada de tratamiento de datos. El consentimiento comercial opcional también se registra.
- El formulario actual exige empresa, cargo, sector y ciudad incluso a una persona; no aplica minimización por audiencia.
- No captura ruta de entrada, audiencia, necesidad, UTM, canal preferido ni clasificación del funnel.
- El honeypot y rate limiting aceptan silenciosamente tráfico descartado, evitando revelar controles antiabuso.
- No hay idempotency key para recuperación/reintentos del visitante.
- WhatsApp aparece como entrada directa antes de que exista evidencia CRM/consentimiento; debe reservarse como opción posterior cuando corresponda.
- PQR, solicitudes de titular y pagos ya tienen flujos especializados; un nuevo orientador debe derivar a ellos sin duplicar datos.
- CRM administrativo consume leads y prospectos reales, pero la fuente pública no entrega clasificación rica.

## SEO y descubrimiento

- `index.html` contiene un único título, descripción, canonical, OG/Twitter y Organization JSON-LD para toda la SPA.
- Las rutas no actualizan metadatos ni canonical en navegación cliente.
- El sitemap enumera rutas que hoy son redirect/scaffolding y omite Legal, recursos, soluciones y páginas de beneficio.
- No hay WebSite, BreadcrumbList ni FAQPage contextual.
- La solución actual es SPA cliente; los crawlers sin ejecución JavaScript solo reciben metadatos globales. Esta limitación debe documentarse, no ocultarse.
- No hay analítica ni píxeles implementados. El gate de cookies correctamente impide inyectar proveedores inexistentes.

## Accesibilidad, responsive y rendimiento

- Skip link, foco por cambio de ruta, drawer con trap/Escape, formularios etiquetados y reduced motion ya existen y deben preservarse.
- Desktop depende de `lg` para navegación; 768 usa drawer correctamente.
- Las animaciones `whileInView` parten de opacidad cero. En captura full-page y navegación programática producen grandes áreas vacías hasta activar intersección; el contenido debe ser visible por defecto y el movimiento solo progresivo.
- La homepage carga `motion/react` y un bundle principal superior al aviso de 500 kB; las nuevas páginas deben cargarse de forma diferida y evitar otro framework visual.
- La imagen del hero reserva relación de aspecto, pero la composición convencional texto/imagen no representa el ecosistema funcional solicitado.
- El formulario de contacto es largo en móvil y no adapta los campos a la intención.

## Riesgos y decisiones de implementación

1. Crear registries tipados de rutas, navegación, beneficios, audiencias, FAQs y metadata.
2. Mantener pagos, PQR y DSR como destinos especializados; el funnel los orquesta, no los replica.
3. Extender `LeadSubmission` de forma aditiva con clasificación, campaña e idempotencia; preservar endpoint y formulario existentes.
4. Vincular cada consentimiento nuevo a la versión legal publicada exacta y distinguir canales mediante evidencia y metadata.
5. Usar contenido visible por defecto; la animación nunca será condición de legibilidad.
6. Implementar metadata cliente por ruta, sitemap completo y datos estructurados válidos, documentando la ausencia de SSR.
7. Mantener identidad, tokens, componentes, Bold, RBAC, documentos legales y módulos internos sin rediseño ajeno al objetivo.

