# Indicadores públicos verificados

Estado: `VERIFIED`. Este bloque aparece exclusivamente en la experiencia pública no legal y no altera el Centro Legal, su catálogo ni sus versiones.

## Indicador temporal

| Indicador | Valor al 2026-08-06 | Fuente autoritativa | Derivación | Presentación |
| --- | ---: | --- | --- | --- |
| Trayectoria institucional | 13 años completos al 2026-08-07 | `ASODEF_COMPANY.registrationDate = 2012-09-10`, en `packages/config/src/company.ts` | Años completos entre la fecha registral y la fecha de consulta. El certificado de existencia y representación legal, código `08264BJBC4`, confirmó el dato el 2026-08-05. | El valor final está siempre disponible para lectores de pantalla. La cifra visible se anima una sola vez al entrar y se entrega de inmediato con `prefers-reduced-motion`. |
| Inicio de operaciones | 2012 | Año de `ASODEF_COMPANY.registrationDate` | Sitúa la trayectoria sin presentar hitos, cobertura o crecimiento no documentados. | Indicador textual; no usa animación numérica. |

El valor no es un conteo inclusivo de años calendario. La función `completedYearsSince` descuenta el aniversario cuando todavía no ha ocurrido en el año consultado; por eso el valor pasa de 13 a 14 el 10 de septiembre de 2026.

## Indicadores cualitativos

| Indicador | Valor mostrado | Fuente | Alcance |
| --- | --- | --- | --- |
| Domicilio registrado | Cali, Colombia | `ASODEF_COMPANY.city` y `ASODEF_COMPANY.country`, confirmados por el dossier institucional | Identidad territorial; no afirma cobertura geográfica. |
| Forma jurídica registrada | S.A.S. | `ASODEF_COMPANY.legalForm`, confirmado por el certificado de Cámara de Comercio el 2026-08-05 | Abreviatura de Sociedad por Acciones Simplificada; no comunica tamaño, liderazgo ni garantía. |

## Decisión editorial

El Inicio ya no presenta como banda institucional los conteos de categorías de beneficios, documentos legales o rutas públicas. Aunque esos conteos son comprobables en el sistema, mezclaban magnitudes de naturaleza distinta y podían interpretarse como escala comercial.

Quedan excluidos los totales de usuarios, familias, empresas, transacciones, satisfacción, cobertura y éxito. No existe una fuente pública autoritativa y fechada que permita presentarlos con el contexto necesario.

Implementación: `apps/web/src/components/public/metrics/verified-public-metrics.ts` y `VerifiedMetricCounter.tsx`.
