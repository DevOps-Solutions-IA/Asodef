# Cierre de claridad, experiencia móvil y movimiento funcional

Fecha de verificación: 2026-08-06 (America/Bogota)  
Fase: US-126–US-137  
Baseline: `5e364bea210cccd1cdc31a3eca6a45bd78a6da46`

## Resultado

La experiencia pública conserva la dirección visual aprobada y prioriza tareas reales. El inicio comunica beneficios y gestiones; contacto dirige primero al flujo especializado; PQR y solicitudes de titulares usan pasos recuperables y seguimiento público seguro. El Centro Legal se mantuvo fuera del alcance visual, funcional y textual.

### Propiedad y revisión

| Rol | Ejecución | Alcance |
|---|---|---|
| Lead architect | agente coordinador | PRD, ownership, integración, routing, rendimiento, QA, Git |
| Content and information architect | `content_ia` | copy no legal, Home, About, registros de contenido |
| Mobile UX and motion specialist | `mobile_motion` | patrones móviles, movimiento, métricas, shell público |
| Transactional UX specialist | `transactional_ux` | PQR, solicitudes de datos y contacto |
| Frontend architect | revisión secuencial del lead | límites de componentes, TypeScript y lazy loading |
| Accessibility and quality | revisión secuencial del lead | teclado, foco, ARIA, reduced motion y viewports |
| Test and release | revisión secuencial del lead | suites, Docker, Chromium y sincronización |

Los especialistas trabajaron sobre archivos disjuntos. Ninguno modificó el PRD, el remoto ni el Centro Legal, y ninguno hizo push.

## Copy y conexión funcional

- Se eliminaron las tres apariciones productivas no legales de los marcadores genéricos prohibidos; el resultado productivo contiene cero.
- Hero final: **“Beneficios y gestiones en el canal correcto.”**
- Apoyo final: “Consulta beneficios, paga, radica solicitudes o entra a tu portal según tu relación con ASODEF.”
- Acciones del hero: **Recibir orientación** y **Consultar beneficios**.
- Los nodos Personas, Afiliados, Empresas, Beneficios, Pagos y Solicitudes son enlaces reales.
- `/quienes-somos` reemplazó el bloque abstracto por una síntesis de identidad corporativa verificada: razón social, NIT, domicilio y registro.
- Beneficios, soluciones y recursos recibieron únicamente correcciones de precisión, jerarquía móvil y enlaces; no fueron rediseñados.

## Patrones compartidos

### Móvil

`CompactPublicHero`, `MobileActionSwitcher`, `ProgressiveStepShell`, `MobileStickyActionBar`, `CompactStatusTimeline`, `HorizontalQuickActions`, `CollapsibleContextHelp`, `MobileConfirmationPanel`, `CopyReferenceAction` y recuperación de formularios con `sessionStorage` validado.

### Movimiento

`SafeReveal`, `StaggeredItems`, `InteractiveSurface`, `SelectionFeedback`, `ConnectionPulse`, `OnceInView` y `RouteTransition`. El contenido existe sin animación, las transiciones usan transformación/opacidad y `prefers-reduced-motion` presenta el estado final inmediatamente.

## Métricas verificadas

| Métrica | Valor | Fuente |
|---|---:|---|
| Categorías de beneficios | 8 | longitud del registro tipado `BENEFITS` |
| Documentos legales institucionales publicados | 21 | estado local verificado: 21 documentos con versión vigente `PUBLISHED` |
| Gestiones públicas especializadas | 4 | registro tipado `PUBLIC_ROUTES`: pagos, PQR, solicitudes de datos y orientación |

Los contadores anuncian el valor final de forma accesible, se ejecutan una sola vez y no animan con movimiento reducido. No se publicaron totales de usuarios, empresas, transacciones, cobertura ni satisfacción.

## Flujos transaccionales

### PQR

1. Categoría.
2. Descripción y referencia de pago opcional.
3. Identificación y contacto.
4. Revisión y consentimiento obligatorio.
5. Confirmación.

Conserva el endpoint real, genera una referencia opaca, permite copiar, imprimir, reiniciar y pasar directamente a seguimiento. La consulta muestra categoría, estado, fases y resolución permitida; no muestra identidad ni cuerpo de la radicación.

### Solicitudes sobre datos personales

1. Tipo de derecho o gestión.
2. Descripción.
3. Identificación y contacto.
4. Revisión y consentimiento.
5. Confirmación.

Conserva el endpoint real, los once tipos jurídicos existentes y el vínculo al procedimiento vigente. La consulta pública omite nombre, documento, correo y descripción.

### Contacto

`/contacto` pregunta “¿Qué necesitas hacer?” y dirige beneficios, pagos, PQR, derechos de datos, empresas, portal y orientación a sus rutas reales. “Otro asunto” revela únicamente nombre, correo, mensaje, consentimiento necesario, autorización de respuesta por correo y consentimiento comercial opcional. La radicación crea un lead real con idempotencia, UTM y versiones legales exactas.

## Rendimiento

| Artefacto | Antes | Después |
|---|---:|---:|
| Entry principal minificado | ~703,49 kB | 194,08 kB |
| Entry principal gzip | ~188,50 kB | 55,64 kB |

El build final no emite la advertencia de chunks mayores de 500 kB. Los grupos estables quedan separados en routing (207,29 kB), motion (103,87 kB), forms (82,39 kB), query (46,49 kB) e icons (30,20 kB); las páginas diferidas principales oscilan entre 1,06 y 13,79 kB. Se mantuvo Home en el primer render y se difirieron rutas públicas secundarias, pagos, formularios, portales, admin y CRM. No se fragmentó el Centro Legal de una forma que alterara su comportamiento.

## Cobertura por ruta

| Ruta o familia | Cambio | Integración verificada | Resoluciones |
|---|---|---|---|
| `/` | copy concreto, enlaces de ecosistema, rail móvil, métricas | rutas reales y orientación | 1440, 1280, 1024, 768, 430, 390, 375, 360, 320 |
| `/quienes-somos` | identidad corporativa verificable y menor densidad | contacto, beneficios, información empresarial | matriz completa |
| `/beneficios`, `/beneficios/*` | copy y movilidad puntuales | registro tipado y rutas relacionadas | matriz completa |
| `/soluciones`, `/soluciones/*`, `/empresas` | terminología y handoffs | portales y orientación | matriz completa |
| `/contacto` | router de tareas y formulario mínimo real | CRM, idempotencia, UTM y consentimientos | matriz completa |
| `/pqr` | flujo progresivo y seguimiento seguro | API real, consentimiento y política vigente | matriz completa + E2E de envío |
| `/solicitudes-de-datos` | flujo progresivo y seguimiento seguro | API real, consentimiento y procedimiento vigente | matriz completa + E2E de envío |
| `/comenzar` | shell semántico y carga diferida | CRM, UTM, consentimiento y handoffs | matriz completa + E2E |
| `/pagos` | carga diferida, sin cambio de proveedor | Bold autorizado, lookup, orden y comprobante | matriz completa + smoke |
| `/iniciar-sesion`, portales y admin | carga diferida y regresión | auth, RBAC, cuenta, empresa, CRM y pagos | desktop, tablet y móvil |
| `/legal`, `/legal/*` | **sin cambios; solo regresión** | 21/21 versiones vigentes y API pública | 1440, 768 y 390 + 21 URL |

## Accesibilidad y QA

- Radio groups con roving tabindex, flechas, Home y End.
- Cambio de foco al título de cada paso y anuncios `aria-live`.
- Restauración de foco y Escape en navegación móvil.
- Acciones táctiles de al menos 48 px y barras contextuales móviles.
- Errores asociados a controles, confirmaciones con estado accesible y referencias copiables con alternativa manual.
- Contadores seguros para lectores de pantalla y movimiento reducido.
- Cero overflow horizontal en 29 rutas a nueve resoluciones.
- Sin errores de consola, `pageerror` ni respuestas HTTP inesperadas en la matriz pública.

## Pruebas y runtime

- Frontend: 75 archivos, 407 pruebas aprobadas.
- Backend: 83 suites, 773 pruebas aprobadas.
- UI compartida: 8 archivos, 46 pruebas aprobadas.
- E2E Chromium: 35/35 aprobadas.
- Lint monorepo: aprobado.
- TypeScript estricto monorepo: aprobado.
- Build de producción: aprobado.
- Migraciones: 33 encontradas, esquema actualizado.
- Seeds: dos ejecuciones consecutivas aprobadas.
- Docker: API y web reconstruidos sin caché; PostgreSQL y Redis conservaron sus volúmenes.
- API: `GET /api/v1/health` respondió `status: ok`.
- Bundle servido: `index-hakqcXDx.js`, correspondiente al build actual.

## Prueba de regresión del Centro Legal

- 13/13 archivos protegidos tienen el mismo SHA-256 que `5e364bea`.
- Los componentes congelados de `/legal/pqr` y `/legal/solicitudes-de-datos` son byte a byte iguales a sus componentes del baseline.
- Digest de slugs publicado: `8b0c9e087020ded401a53cb1f826acda`, igual al baseline.
- 21/21 documentos institucionales conservan una versión actual `PUBLISHED`.
- Las 21 URL respondieron correctamente y no mostraron placeholders ni documentos sintéticos.
- Catálogo, seed, bodies, metadata, versiones, `currentVersionId`, publicación y consentimiento legal no fueron modificados por esta fase.
- El E2E conservó la apariencia del Centro Legal en desktop, tablet y móvil; cualquier evidencia gráfica es descartable y permanece ignorada.

## Incidencias corregidas durante QA

- El foco de las opciones tipo radio se difería innecesariamente y fallaba la respuesta inmediata de teclado.
- El formulario general de contacto pedía más contexto del necesario; ahora minimiza datos y conserva CRM/consentimiento real.
- La confirmación E2E suponía prefijos de referencia inexistentes; ahora valida la referencia opaca realmente emitida.
- El resultado de `/comenzar` anidaba un segundo `main`; ahora mantiene una sola región principal.
- El entry inicial incluía módulos administrativos, transaccionales y librerías pesadas; ahora se divide por ruta y capacidad.
- Se mantuvieron componentes congelados para evitar que la evolución de PQR/DSR canónica alterara `/legal/*`.

No hubo despliegue, cambio de DNS, proveedor de pagos, secretos ni infraestructura de producción.
