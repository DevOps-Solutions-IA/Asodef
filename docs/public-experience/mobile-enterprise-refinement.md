# Refinamiento móvil enterprise — baseline de implementación

Fecha: 2026-08-06 (America/Bogota)  
Baseline sincronizado: `c38fef82eff2e8d7d1a57939aa05e57d1291d0cc`  
Branch y upstream: `main` → `origin/main`

## Alcance ejecutivo

La fase modifica únicamente superficies públicas no legales: `/`, `/beneficios`, `/beneficios/*`, `/contacto`, `/pqr`, `/solicitudes-de-datos` y el shell público. La verificación cubre además quiénes somos, soluciones, empresas, pagos, orientación y login.

Los defectos acotados del baseline son: chip de audiencias y CTA repetidas en el hero móvil; Pagar relegado bajo Ingresar en el drawer; Resources móvil con destinos adicionales; métricas técnicas dominando Home; filtros y CTA de beneficios con densidad móvil; y copy introductorio transaccional todavía más largo de lo necesario. No se abre una auditoría adicional.

## Propiedad de archivos

| Propietario | Archivos exclusivos |
|---|---|
| Lead integrator | `.agents/tasks/prd-asodef-phase1.json`, este documento, `PublicLayout.tsx` y su prueba, E2E, integración, commits y push |
| Mobile enterprise UX + motion | `FlagshipHero.tsx`, `HomePage.tsx`, métricas públicas y sus pruebas/documentación |
| Public content clarity | `BenefitsPage.tsx`, `BenefitDetailPage.tsx` y sus pruebas |
| Transactional UX | `ContactPage.tsx`, `PqrCasePage.tsx`, `DataSubjectRequestPage.tsx`, componentes transaccionales y pruebas |
| Accessibility and QA | revisión de solo lectura y hallazgos devueltos al lead; no modifica archivos en paralelo |

No hay propiedad compartida concurrente. Ningún especialista modifica PRD, remotos, archivos legales protegidos ni hace push.

## Frontera legal protegida

Quedan congelados `/legal`, `/legal/*`, el catálogo, seeds, API legal, layout, páginas editoriales, metadata, cuerpos, versiones y consentimientos versionados. Las rutas públicas canónicas `/pqr` y `/solicitudes-de-datos` pueden evolucionar; sus equivalentes bajo `/legal/*` continúan usando copias baseline byte a byte.

Estado DB inicial:

- documentos institucionales actuales `PUBLISHED`: `21`;
- digest de slugs: `8b0c9e087020ded401a53cb1f826acda`;
- digest JSONB de slug, versión, estado, relaciones current/version y contenido aprobado: `9bfa2bfc61494bb672c1bb7925f874c4`.

Hashes visuales ignorados:

- `legal-wide.png`: `9ed0bd67bb4020516771dd4ed86ecf069bbf56f03fcdf73df381ca1009f0a8fb`;
- `legal-mobile.png`: `1c9923adb3f208e5441beda5d95bb6cd28858aad8267ce8a27513e6556497323`;
- `privacy-wide.png`: `d9714eddaaf29743e8d59cdfb3e4d0c08109148d6228d780b06e80aa2e3c2d71`.

Los 13 hashes de archivos legales base coinciden con la fase anterior. Se añaden como guardas `LegacyPqrCasePage.tsx` (`5320bf9e…`), `LegacyDataSubjectRequestPage.tsx` (`0d166838…`) y `router.tsx` (`905c965f…`).

## Matriz de aceptación

| Área | 1440–768 | 430–320 | Prueba obligatoria |
|---|---|---|---|
| Home | hero y header equilibrados | chip ausente, dos CTA, cinco acciones sin clipping | DOM, interacción y screenshot |
| Navegación | Pagar antes de Ingresar | un cierre, orden Pagar/Ingresar/Orientación, Resources con dos entradas | teclado, Escape, foco y overflow |
| Métricas | evidencia institucional sobria | una cifra y dos capacidades compactas | fuente, reduced motion y layout |
| Beneficios | arquitectura preservada | filtros compactos y CTA uniformes | URL, teclado, 390 y 320 |
| Contacto/PQR/DSR | funcionalidad real preservada | selector principal en primer viewport | envío, tracking, consentimiento y PII |
| Legal | solo regresión | idéntico al baseline | hashes, DB, 21 URL y screenshots |

Resoluciones obligatorias: 1440, 1280, 1024, 768, 430, 390, 375, 360 y 320 px. Cualquier diferencia legal o pérdida funcional bloquea el release.

## Resultado implementado

Estado: `COMPLETE` para US-138–US-145.

- Home usa el titular “Beneficios, pagos y solicitudes en un solo lugar.” y una sola frase de apoyo. El chip de audiencias no se renderiza visualmente en móvil.
- El hero conserva `Recibir orientación` y `Consultar beneficios`. El grid móvil separado contiene, sin duplicados ni clipping: `Pagar`, `Radicar PQR`, `Consultar caso`, `Solicitudes de datos` e `Ingresar`; `Pagar` ocupa la primera fila transaccional.
- Desktop y drawer presentan `Pagar`, `Ingresar`, `Recibir orientación`, en ese orden. Resources contiene únicamente PQR y Solicitudes de datos. El Drawer conserva un solo cierre, Escape, bloqueo de scroll y restauración de foco.
- Home dejó de promover conteos internos 8/21/4. Muestra un solo dato temporal (`13 años como ASODEF S.A.S.` al 2026-08-06) calculado desde `ASODEF_COMPANY.registrationDate = 2012-09-10`, más domicilio y forma jurídica registrados. El contador termina una vez y reduced motion muestra el valor final de inmediato.
- Beneficios conserva sus ocho categorías y fuentes; el hub compacta copy, filtros persistentes de 48 px y conteo. Cada detalle prioriza `Encontrar mi ruta` y mantiene `Volver al portafolio` como acción secundaria.
- Contacto conserva las ocho intenciones y solo revela el formulario CRM para `Otro asunto`. PQR y solicitudes de datos conservan sus cinco pasos, API, consentimiento versionado, estado recuperable, copia/impresión y tracking público sin PII.
- Las transiciones usan transform/opacity ya existentes, feedback de presión y profundidad sobria; no hay loops, parallax, animación legal ni contenido condicionado a motion.

## Rondas de calidad

Se cerraron ocho loops de historia (implementación, revisión especialista, navegador y regresión) y tres loops globales:

1. **Funcional:** CTA, redirects, drawer, filtros, contacto, PQR, DSR, pagos, guided funnel, CRM, UTM, idempotencia, consentimientos, auth/RBAC y tracking.
2. **Visual/móvil:** 29 rutas en 1440, 1280, 1024, 768, 430, 390, 375, 360 y 320 px; revisión manual de Home, Beneficios, Contacto, PQR y DSR; una acción parcialmente visible detectada en 390 px fue sustituida por un grid completo y se repitió la matriz.
3. **Release:** suites, lint, TypeScript, build, migraciones, seeds, Docker, health, bundle servido, legal y Git.

Resultados finales:

| Gate | Resultado |
|---|---|
| Frontend | 75 archivos / 416 pruebas |
| Backend | 83 suites / 773 pruebas |
| UI compartida | 8 archivos / 46 pruebas |
| Chromium E2E | 38/38 |
| TypeScript y lint | monorepo aprobado |
| Migraciones | 33 encontradas; esquema actualizado |
| Seed | dos ejecuciones consecutivas aprobadas |
| Docker | API y web reconstruidos sin caché; volúmenes preservados |
| Runtime | web `:8080`; API health `:3200/api/v1/health` = `ok` |

El entry anterior documentado era 194,08 kB minificado. El final es 194,60 kB (55,52 kB gzip), sin advertencia de 500 kB. Se mantienen chunks separados: routing 207,29 kB, motion 103,87 kB, forms 82,39 kB, query 46,49 kB e icons 30,20 kB; las rutas modificadas siguen diferidas por feature cuando corresponde.

## Prueba final del Centro Legal congelado

- `git diff c38fef8 -- <16 archivos protegidos>` no produce diferencias; catálogo, seed, validador, tipos, API, layout, clientes, catálogo web, páginas, copias Legacy y bloque de router son byte a byte iguales.
- Los hashes SHA-256 registrados al inicio continúan iguales; en particular Legal Center `91c53520…`, documento editorial `d694dd82…`, Legacy PQR `5320bf9e…`, Legacy DSR `0d166838…` y router `905c965f…`.
- Estado DB final: `21` current versions `PUBLISHED`; digest de slugs `8b0c9e087020ded401a53cb1f826acda`; digest JSONB de slug, versión, estado, relaciones y body aprobado `9bfa2bfc61494bb672c1bb7925f874c4`, exactos al baseline.
- Chromium confirmó `/legal` en desktop, tablet y móvil y las 21 URL institucionales; cero placeholders, fixtures sintéticos u overflow.
- No se aplicó motion, copy, layout, responsive, metadata ni modificación de datos a `/legal` o `/legal/*`.

No hubo deploy, DNS, cambios productivos, cambio de Bold, reset de base de datos ni borrado de volúmenes.
