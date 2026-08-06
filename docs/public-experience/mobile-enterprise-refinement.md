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
