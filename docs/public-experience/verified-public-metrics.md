# Métricas públicas verificadas

Estado: `VERIFIED` para el código y los catálogos indicados. Estas cifras se muestran únicamente fuera del Centro Legal y no alteran sus datos, versiones ni presentación.

| Métrica | Valor | Fuente autoritativa | Derivación | Comportamiento público |
| --- | ---: | --- | --- | --- |
| Categorías de beneficios | 8 | `apps/web/src/lib/public-content/benefits.ts` | Longitud del registro canónico y tipado `BENEFITS` | El valor final es accesible para lector de pantalla; la cifra visible se anima una sola vez. |
| Documentos institucionales publicados | 21 | Instantánea verificada de `LegalDocument.currentVersionId` y sus versiones `PUBLISHED` | Verificación al inicio y al cierre: 21 de 21 documentos institucionales con versión vigente publicada | Enlaza conceptualmente con el Centro Legal existente; no modifica su catálogo ni sus documentos. |
| Gestiones públicas | 4 | `apps/web/src/lib/public-content/public-routes.ts` | Miembros tipados `payments`, `pqr`, `dsr` y `start`: `/pagos`, `/pqr`, `/solicitudes-de-datos` y `/comenzar` | Resume pagos, PQR, datos personales y orientación; no módulos decorativos ni promesas futuras. |

La implementación vive en `apps/web/src/components/public/metrics/verified-public-metrics.ts`. Los tests verifican la correspondencia con las fuentes, la exposición permanente del valor final accesible y la entrega inmediata del estado final cuando `prefers-reduced-motion` está activo.

Quedan deliberadamente excluidos los totales de usuarios, familias, empresas, transacciones, satisfacción, cobertura y éxito. No existe en el alcance actual una fuente pública autoritativa y fechada que permita presentarlos sin contexto o falsa precisión.
