# Cierre de evolución visual premium empresarial

Fecha de verificación: 2026-08-05 (America/Bogota)

## Alcance entregado

- Fundamentos semánticos de superficie, borde, profundidad, workspace y movimiento sobre la paleta ASODEF existente.
- Componentes compartidos refinados para jerarquía, interacción, formularios, estados y presentación de datos.
- Un `WorkspaceShell` común para administración, cuenta y empresa, con sidebar desktop y drawer móvil accesible.
- Sitio público con mayor composición, ritmo, profundidad y evidencia institucional, sin cambiar contenido aprobado.
- Centro Legal con biblioteca de mayor jerarquía y lector editorial, preservando sus 21 publicaciones vigentes.
- Centro de Pagos con contexto transaccional, señales de confianza, estados y comprobante premium, sin modificar Bold ni recolectar datos de tarjeta.
- Dashboard, CRM y administración con superficies densas, filtros, tablas, estados de atención y maestro-detalle legal coherentes.
- Portales internos integrados al mismo sistema visual sin relajar autenticación, rol ni permisos.

## Defectos reales corregidos

1. El shell administrativo mostraba toda la navegación antes del contenido en 390 px. Ahora usa un drawer móvil y el contenido principal queda visible inmediatamente.
2. El resumen de pago enlazaba una ruta inexistente para reversiones y reembolsos. Ahora usa `/legal/reversiones-y-reembolsos`.
3. La navegación desktop pública se comprimía prematuramente en 768 px. El patrón móvil/tablet se mantiene hasta `lg`.
4. Los nombres accesibles de navegación se preservaron durante la unificación de shells (`Administración` y `Cuenta`).

## Evidencia de ingeniería

| Verificación | Resultado |
|---|---|
| UI unitarias | 46/46 |
| Frontend unitarias/integración | 409/409 |
| Backend | Suite completa, exit 0 |
| E2E funcional y visual | 22/22 |
| Auditoría visual Chromium incluida | 3/3 (1440, 768, 390 px) |
| Lint monorepo | 7/7 tareas |
| Typecheck estricto | 8/8 tareas |
| Build producción | 5/5 tareas |
| Migraciones | 32 aplicadas; esquema al día |
| Seeds | dos ejecuciones consecutivas exitosas |
| Docker | imágenes reconstruidas sin caché; cuatro servicios healthy |
| API health | database ok; redis ok |

La auditoría Chromium cubre `/`, `/legal`, un documento legal publicado, `/pagos`, `/admin`, `/admin/crm/empresas`, `/admin/legal` y `/mi-cuenta` en los tres anchos. Verifica ausencia de overflow horizontal, errores de runtime, rutas rotas y degradación del shell móvil.

## Estado de runtime local

- Frontend: `http://localhost:8080` — healthy.
- API: `http://localhost:3200` — healthy.
- PostgreSQL: `asodef-postgres-1` — healthy.
- Redis: `asodef-redis-1` — healthy.
- No hubo deploy, push, modificación de DNS ni contacto con infraestructura productiva.
