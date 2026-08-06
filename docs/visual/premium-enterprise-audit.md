# Auditoría de evolución visual premium empresarial

Fecha: 2026-08-05 (America/Bogota)  
Baseline: `master` en `aa259ad11b93f9cecb054f0d8b6b127410ce577a`  
Runtime auditado: web `http://localhost:8080`, API `http://localhost:3200`

## Alcance inspeccionado

- Fundamentos: `apps/web/src/index.css`, Tailwind y activos de marca.
- Sistema compartido: botones, tarjetas, campos, estados, diálogos, drawers, encabezados, navegación y feedback de `@asodef/ui`.
- Shells: público, autenticación, pagos, Centro Legal, administración, cuenta y empresa.
- Sitio público: hero, confianza, identidad, cifras, beneficios, portafolio, cobertura, alianza y contacto.
- Producto: Centro Legal y lectura documental, pagos y comprobantes, dashboard administrativo, CRM, empresas, pipeline, pagos administrativos, reportes, área legal, PQR, DSR y portales internos.
- Responsive real en Chromium: capturas iniciales a 1440, 768 y 390 px; navegación y densidad de las rutas públicas e internas.

## Fortalezas que deben preservarse

- La identidad institucional está bien definida mediante verdes ASODEF, acento naranja, neutrales cálidos, tipografía Outfit/Inter y activos oficiales.
- Ya existen escalas tonales, elevaciones teñidas por marca, radios amplios, foco visible y reducción de movimiento.
- Los componentes compartidos cubren estados, formularios, feedback, diálogos y drawers sin una segunda librería.
- El Centro Legal ya tiene contenido editorial, índice, búsqueda, metadatos, impresión y documentos relacionados.
- Las pantallas funcionales conservan buena semántica, estados de carga/error/vacío y controles de acceso reales.

## Brechas globales verificadas

1. **Shells internos demasiado básicos.** Administración y cuenta presentan una lista textual extensa y plana. En 390 px toda la navegación aparece antes del contenido; el dashboard comienza después de una columna de enlaces, degradando severamente la tarea principal.
2. **Jerarquía interna inconsistente.** Los módulos alternan títulos sueltos, `PageHeader`, tarjetas y tablas sin una composición de workspace común ni señal clara de contexto, usuario o sección.
3. **Superficies demasiado homogéneas.** Tarjetas, filtros y tablas se apoyan casi siempre en blanco + borde tenue. Falta una jerarquía de superficies operativas, encabezados de panel y profundidad controlada.
4. **Tablas CRUD.** La lectura es correcta, pero los encabezados, filas, densidad, contenedores, referencias y estados se sienten utilitarios; no existe una capa sistémica de presentación de datos.
5. **Formularios transaccionales sin contexto visual suficiente.** Los controles son sólidos, pero pagos y acciones críticas no comunican proceso, seguridad y progreso con la intensidad visual esperable.
6. **Movimiento no totalmente cohesivo.** El sitio público tiene entradas `whileInView`, pero no existe una gramática común de transición para surfaces, navegación y feedback del producto.
7. **Cookie banner intrusivo en superficies densas.** En las capturas iniciales ocupa una franja dominante sobre tablas y dashboards. Se debe compactar sin perder elecciones ni accesibilidad.

## Brechas locales verificadas

- **Sitio público:** buena dirección de marca, pero el ritmo vertical repetido, fondos uniformes y tarjetas similares generan tramos visualmente planos. El hero puede comunicar más tecnología, evidencia y confianza sin cambiar el mensaje.
- **Centro Legal:** sólido y completo, aunque el índice lateral domina en desktop y la biblioteca puede ganar navegación temática, densidad editorial y profundidad.
- **Centro de Pagos:** es la brecha pública más clara. La pantalla inicial es un formulario blanco aislado sobre una gran zona vacía; carece de pasos, señales de protección y contexto de transacción. Se encontró además un enlace real incorrecto a la política de reembolsos en el resumen de orden.
- **Dashboard:** métricas correctas pero visualmente equivalentes. Falta priorización, agrupación, iconografía y lectura ejecutiva.
- **CRM/admin:** tablas y kanban funcionan, pero parecen back-office CRUD. Requieren barras de herramientas, contenedores de datos, mejor densidad y señalización de contexto.
- **Administración legal:** la lista de 23 registros es texto plano y el estado vacío ocupa gran superficie; necesita panel maestro-detalle, resumen de estado y navegación compacta.
- **Portales internos:** reutilizan la estructura básica del sidebar y varias rutas continúan siendo placeholders; el resumen real de consentimientos necesita un encabezado y superficies coherentes con el producto premium.

## Decisiones sistémicas

- Añadir tokens semánticos de superficie, división, brillo, control, workspace y movimiento, derivados exclusivamente de la paleta vigente.
- Evolucionar componentes compartidos antes de retocar páginas: tarjetas por intención, encabezados, inputs, estados, modales y tabla/contenedor operativo.
- Construir un único `WorkspaceShell` configurable para admin, cuenta y empresa, con sidebar desktop, topbar y drawer móvil accesible.
- Aplicar fondos y ritmos de sección al sitio público; preservar contenidos, tipografías y colores existentes.
- Dar al Centro de Pagos una composición segura de dos zonas con indicadores de proceso y confianza, sin afirmar proveedores o capacidades no implementadas.
- Refinar datos densos mediante estilos comunes y no mediante forks por página.
- Mantener las transiciones breves, discretas, con soporte `prefers-reduced-motion`.

## Criterio de cierre

La fase se considera cerrada únicamente cuando los cambios estén integrados, las suites y build estén verdes, Docker sirva el bundle actualizado y Chromium verifique rutas representativas a 1440, 768 y 390 px sin overflow, pérdida de foco, navegación rota ni regresiones funcionales.
