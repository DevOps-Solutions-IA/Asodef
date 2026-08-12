# Matriz funcional del Bingo legado

## Propósito y alcance

Este documento inventaría el comportamiento real de `BingoVirtualPro` y define qué valor funcional debe migrarse al módulo nativo de ASODEF. No propone conservar FastAPI, SQLAlchemy, SQLite, Jinja, JavaScript global ni una aplicación independiente.

Las conclusiones se etiquetan así:

- **HECHO VERIFICADO:** comportamiento observado directamente en código, esquema o pruebas del legado.
- **RECOMENDACIÓN:** forma propuesta de conservar el comportamiento dentro de React, NestJS, Prisma, PostgreSQL, Redis y el RBAC existentes de ASODEF.
- **REQUIERE CONFIRMACIÓN:** regla funcional que el legado no define de manera suficiente.

Clasificación empleada:

- **REUTILIZABLE DIRECTAMENTE:** artefacto que podría incorporarse sin portar tecnología ni debilitar seguridad.
- **REUTILIZABLE CON ADAPTACIÓN:** regla, algoritmo, flujo o vector de prueba útil que debe traducirse y reforzarse.
- **REIMPLEMENTAR:** comportamiento válido cuya implementación actual es incompatible con ASODEF.
- **DESCARTAR:** comportamiento inseguro, obsoleto o contrario a las decisiones aprobadas.

No se encontró código de ejecución productiva que califique como **REUTILIZABLE DIRECTAMENTE**. Los recursos de marca podrían reutilizarse solamente después de confirmar que son los activos oficiales vigentes; la interfaz deberá componerse con `packages/ui`.

## Fuentes inspeccionadas

Se inspeccionaron en modo de solo lectura:

- `app/main.py`: rutas, estados, operación, importación, consulta, reinicio y exportación.
- `app/services.py`: generación, sorteo, patrones, candidatos y validación.
- `app/models.py`: entidades y restricciones SQLAlchemy.
- `app/db.py`: SQLite, WAL y configuración de sesión.
- `app/security.py`: credenciales y sesión administrativa local.
- `app/reports.py`: XLSX, mitigación de fórmulas y PDF.
- `app/static/app.js`: operación, polling, cartón en vivo y confirmación de candidatos.
- `app/static/app.css` y plantillas de `app/templates/`: flujo y lenguaje visual.
- `tests/test_system.py`: siete escenarios automatizados existentes.
- `README.md`, `ARQUITECTURA.md`, `MANUAL_USUARIO.md` y reportes de pruebas.
- `requirements.txt`, scripts de inicio y configuración de pytest.
- La estructura declarada y el archivo local `data/bingo.db`; no se consultaron ni copiaron datos personales.

No se ejecutó la suite legada porque usa directamente `data/bingo.db` y sus pruebas escriben registros persistentes. Los resultados mencionados para ella son los reportados por el repositorio, no una nueva ejecución.

## Decisiones aprobadas usadas como referencia

Para hacer trazable la última columna de las matrices:

| ID | Decisión aprobada relevante |
| --- | --- |
| D01 | Un evento admite múltiples rondas y premios. |
| D02 | Elegibilidad configurable por evento. |
| D03 | Identidad externa resuelta formalmente hacia `Affiliate.id`. |
| D04 | Máximo de cartones configurable por evento. |
| D05 | Reasignación solo antes del sorteo, con historial inmutable. |
| D06 | Visibilidad pública, autenticada o restringida por participantes. |
| D07 | Consulta segura; nunca documento, teléfono o código por sí solos. |
| D08 | Bingo es módulo administrativo propio, no contenido por el launcher. |
| D09 | Launcher `Herramientas` en `/admin/herramientas`. |
| D10 | Roles especializados y autorización por permisos. |
| D11 | Validación simple o doble control configurado previamente. |
| D12 | Todos los ganadores de la misma balota decisiva y política de empate previa. |
| D13 | Reiniciar crea una nueva ejecución/revisión y nunca borra evidencia. |
| D14 | RNG criptográfico obligatorio; commit-reveal configurable. |
| D15 | CSV/XLSX pasan por cuarentena, validación, staging, preview y aprobación. |
| D16 | Diseño para 50.000 cartones/participantes y 10.000 espectadores. |
| D17 | Retención configurable con mínimos corporativos para evidencia. |
| D18 | Identidad pública del ganador configurable y sin PII sensible. |
| D19 | Feature flags por superficie y, potencialmente, por evento. |
| D20 | Primera producción en la misma VPS, preparada para múltiples procesos. |

## Matriz maestra de reutilización

### Eventos, rondas, premios y estados

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| `Bingo` guarda nombre, fecha, hora, un premio, un patrón y estado (`models.py`). | REIMPLEMENTAR | Configurar anticipadamente un juego y su modalidad. | Separar evento, rondas, ejecuciones/revisiones y premios en el dominio NestJS/PostgreSQL. | D01 exige múltiples rondas y premios; el registro monolítico no sirve. |
| Estados de texto `draft`, `running`, `paused`, `finished`; los endpoints asignan valores directamente (`main.py`). | REUTILIZABLE CON ADAPTACIÓN | Borrador, inicio, pausa, reanudación y cierre son estados funcionales útiles. | Máquina de estados explícita, comandos autorizados, versión optimista/bloqueo y checks de base de datos. | D10-D13: permisos, doble control y revisiones; no permitir transiciones arbitrarias o retroactivas. |
| `start` conserva el primer `started_at`; `finish` registra `ended_at`. | REUTILIZABLE CON ADAPTACIÓN | Timestamps de inicio y cierre. | Timestamps inmutables por ejecución, actor, requestId, motivo y evidencia transaccional. | D11-D13 y auditoría corporativa. |
| Cada `Bingo` tiene exactamente una modalidad y un campo `prize`. | DESCARTAR como modelo | La modalidad y descripción del premio siguen siendo conceptos válidos. | Premio relacionado con ronda/configuración; reglas congeladas al iniciar. | D01, D11 y D12 prohíben el supuesto de una sola ronda/premio. |
| No existe elegibilidad, visibilidad ni límite de cartones por participante. | REIMPLEMENTAR | No hay implementación reutilizable. | Políticas versionadas por evento, evaluadas por backend antes de participar/asignar/consultar. | D02, D04 y D06. |
| No hay feature flags. | REIMPLEMENTAR | Ninguno. | Flags según convenciones ASODEF para administración, afiliado, público y evento. | D19. |

### Cartones, generación y unicidad

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| `COL_RANGES`: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75. | REUTILIZABLE CON ADAPTACIÓN | Distribución estándar B-I-N-G-O de 75 balotas. | Función de dominio TypeScript pura, parámetros inmutables por tipo de juego y vectores de prueba. | D14 exige RNG criptográfico; D16 exige representación eficiente. |
| Se eligen cinco números únicos por columna, se ordenan y el centro `[2][2]` se reemplaza por `0`. | REUTILIZABLE CON ADAPTACIÓN | Cartón 5x5, orden por columna, 24 números jugables y centro libre. | Generador determinista bajo interfaz RNG; fuente criptográfica real en producción y fuente inyectable en tests. | No trasladar `random.sample`: Python `random` no es criptográfico, aunque el README describa aleatoriedad segura para el sorteo. |
| Firma textual de 25 posiciones y unique `(bingo_id, signature)`. | REUTILIZABLE CON ADAPTACIÓN | Dos cartones equivalentes no deben coexistir en el mismo evento. | Canonicalización estable más unique en PostgreSQL; evaluar bitset/binario o hash con verificación de colisión. | D16: la firma CSV textual y el set en memoria requieren benchmark a 50.000. |
| Número de cartón único por bingo y código global único. | REUTILIZABLE CON ADAPTACIÓN | Identificador visible estable y unicidad por evento. | Unique `(eventId, cardNumber)` y token público separado, aleatorio y de alta entropía cuando aplique. | D07: `B0001-00001-FFFF` tiene solo 16 bits aleatorios y partes predecibles; no debe autenticar por sí solo sin política segura. |
| `create_cards` acepta 1–10.000 por llamada, carga todas las firmas existentes y reintenta hasta un límite. | REIMPLEMENTAR | Generación por lotes y fallo explícito si no puede completar la cantidad. | Job/comando transaccional por lotes, constraints PostgreSQL, reintentos de conflictos y métricas; benchmark 5k/10k/25k/50k. | D04 y D16: el límite es por evento/participante y la meta es 50.000; `existing_count + len` no es seguro con concurrencia. |
| `flush` cada 500 y un único `commit` al final. | REIMPLEMENTAR | Procesamiento por lotes. | Transacciones con límites explícitos e idempotencia; no retener 50.000 objetos ORM innecesariamente. | D16 y operación multi-proceso de D20. |
| `numbers_json` guarda la matriz completa; cada candidato la deserializa. | REIMPLEMENTAR | Persistir composición inmutable del cartón. | Representación validada y eficiente para consulta/detección (bitmask o alternativa benchmarkeada), con DTO de presentación separado. | D16: evitar escaneo/deserialización ingenuos. |
| PDF individual y cuatro cartones por página. | REUTILIZABLE CON ADAPTACIÓN | Cartones imprimibles, código, número, centro libre e identidad visual. | Reporte nativo autorizado, generado desde DTO seguro y componentes/branding aprobados. | D18: no incluir PII sin permiso; aplicar retención y auditoría de exportación D17. |

### Patrones y validación

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| `line` acepta cualquiera de las cinco filas horizontales; el centro libre reduce una fila a cuatro números. | REUTILIZABLE CON ADAPTACIÓN | Modalidad de línea y semántica de centro libre. | Patrón precalculado como máscara; función determinista independiente de DB/React/Redis. | **REQUIERE CONFIRMACIÓN:** si “línea” seguirá siendo solo horizontal o incluirá columnas/diagonales. |
| `two_lines` acepta cualquier par de filas horizontales distintas. | REUTILIZABLE CON ADAPTACIÓN | Dos líneas simultáneas y conservación de todas las combinaciones válidas. | Combinaciones de máscaras precalculadas y prueba de balota decisiva. | D12; **REQUIERE CONFIRMACIÓN** sobre orientaciones permitidas. |
| `corners` usa las cuatro esquinas. | REUTILIZABLE CON ADAPTACIÓN | Modalidad cuatro esquinas. | Máscara inmutable probada unitariamente. | D12: detectar todos los cartones que completan con la misma extracción. |
| `full` requiere las 24 posiciones no libres. | REUTILIZABLE CON ADAPTACIÓN | Cartón lleno. | Máscara completa y comparación bit a bit. | D16: benchmark a 50.000 cartones. |
| `custom` recibe una matriz JSON generada por la UI. | REIMPLEMENTAR | Patrones configurables visualmente. | Entidad/configuración validada: dimensiones, posiciones permitidas, no vacío, versión y freeze antes del inicio. | D11-D12: política inmutable. El legado acepta máscara vacía/malformada y puede declarar ganador sin requisitos. |
| `validate_matrix` devuelve válido y faltantes del patrón más cercano. | REUTILIZABLE CON ADAPTACIÓN | Resultado determinista y ayuda operativa de números faltantes. | Función pura que retorne resultado tipado y evidencia; no filtrar información sensible al público. | D18 y autorización por superficie. |
| Heurística mínima evita escaneo temprano: línea 4, dos líneas 9, esquinas 4, lleno 24. | REUTILIZABLE CON ADAPTACIÓN | Evitar trabajo antes de que ganar sea matemáticamente posible. | Precondición derivada del patrón, no mapa manual; luego índice/bitmask benchmarkeado. | D16. Para patrones personalizados el mínimo debe calcularse, no quedar en `1`. |
| Pruebas existentes cubren un caso positivo de línea horizontal, pero no validan dos líneas, esquinas, lleno, patrones custom ni máscaras inválidas. | REUTILIZABLE CON ADAPTACIÓN | Casos observables como vectores de aceptación. | Reescribir en Jest con tablas exhaustivas, property-based cuando convenga y benchmarks. | D12, D14 y D16; las siete pruebas no bastan como evidencia productiva. |

### Sorteo, historial y concurrencia

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| `draw_number` selecciona con `secrets.choice` entre 1–75 menos las llamadas. | REUTILIZABLE CON ADAPTACIÓN | RNG criptográfico sobre el conjunto restante; nunca repetir balota. | Comando NestJS transaccional: lock de ejecución, RNG criptográfico, secuencia, draw, candidatos, evidencia, auditoría, commit y publicación posterior. | D14; commit-reveal opcional debe añadirse sin revelar semilla antes de tiempo. |
| Unique `(bingo_id, number)` evita repetición por bingo. | REUTILIZABLE CON ADAPTACIÓN | Constraint de balota única. | Unique `(roundExecutionId, ball)` y unique de secuencia; checks 1–75. | D01 y D13: la autoridad es la ejecución, no el evento monolítico. |
| Orden histórico se infiere por `CalledNumber.id`; no existe número de secuencia explícito. | REIMPLEMENTAR | Orden total, timestamp y actor de cada extracción. | `sequence` explícita, versión, unique, requestId/idempotency key y evidencia inmutable. | D12-D14 y reconexión SSE futura. |
| Sorteo hace commit antes de detectar candidatos y pausar. | DESCARTAR | Ninguno de este límite transaccional. | Extracción, detección, transición y evidencia en una única transacción PostgreSQL. Publicar realtime después del commit. | D12-D14; evita estado visible con draw confirmado pero pausa/candidatos no confirmados. |
| Dos requests pueden leer el mismo conjunto restante; SQLite y la unique son la única defensa. | REIMPLEMENTAR | Rechazar duplicados sigue siendo obligatorio. | `SELECT ... FOR UPDATE`, isolation/idempotencia y pruebas reales de concurrencia PostgreSQL. | D16 y D20: múltiples operadores/procesos. |
| Triggers SQLite bloquean UPDATE/DELETE de llamadas. | REUTILIZABLE CON ADAPTACIÓN | Extracciones históricas inmutables. | Permisos, constraints/trigger PostgreSQL solo si aporta defensa adicional, append-only de revisiones y retención corporativa. | D13 y D17. No copiar SQL SQLite. |
| La prueba extrae 75 números y verifica exactamente 1–75 sin repetición. | REUTILIZABLE CON ADAPTACIÓN | Vector de aceptación fundamental. | Test unitario más integración PostgreSQL concurrente e idempotente. | D14 y D20. |

### Candidatos, ganadores, empates y balota decisiva

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| Después de cada extracción se recorren todos los cartones asignados no ganadores y se retornan todos los que cumplen. | REUTILIZABLE CON ADAPTACIÓN | Solo cartones participantes son elegibles y todos los candidatos simultáneos deben conservarse. | Detección determinista en la misma transacción, con representación/indexación benchmarkeada y candidatos persistidos. | D02 y D12. El escaneo JSON completo no escala a D16. |
| Al detectar candidatos, el bingo se pausa y la UI los presenta juntos. | REUTILIZABLE CON ADAPTACIÓN | Pausa operativa y revisión de todos los candidatos de la balota decisiva. | Transición de ejecución y conjunto de candidatos vinculados al mismo draw/sequence. | D11-D12: política simple/doble control y empate preconfigurado. |
| Prueba existente confirma dos candidatos simultáneos. | REUTILIZABLE CON ADAPTACIÓN | Caso de regresión obligatorio. | Vector unitario y prueba transaccional donde dos o más cartones completan en el mismo draw. | D12: no seleccionar uno arbitrariamente. |
| Cada candidato se confirma individualmente y `Winner` guarda cartón, participante, patrón, validador y `decisive_number`. | REUTILIZABLE CON ADAPTACIÓN | Confirmación, actor, modalidad y balota decisiva como evidencia. | Candidato y ganador separados; validación atómica, evidencia inmutable, política de doble control y resultado del conjunto empatado. | D11-D12. El operador no debe autovalidar cuando aplique doble control. |
| La balota decisiva se toma como “última llamada” al momento de confirmar. | REIMPLEMENTAR | Conservar la balota que causó el cumplimiento. | FK directa al draw decisivo persistida al crear candidatos, no recalculada después. | D12: evita deriva por reanudación/concurrencia. |
| El legado no modela política de empate, división, premio completo o desempate. | REIMPLEMENTAR | La detección múltiple sirve, la adjudicación no. | Política de empate congelada en ronda/premio; resolución preserva el conjunto original. | D12. |
| No hay unique de ganador `(bingo, card)`; se hace `count` antes de insertar. | REIMPLEMENTAR | Idempotencia de confirmación. | Unique de dominio, idempotency key y transacción; impedir duplicación concurrente. | D11-D12. |
| Triggers hacen ganadores inmutables. | REUTILIZABLE CON ADAPTACIÓN | Ganadores y evidencia no se editan ni borran. | Registros append-only, correcciones mediante nuevas decisiones/evidencias, retención mínima. | D13 y D17. |
| Candidatos no se persisten; se recalculan desde estado actual. | REIMPLEMENTAR | Ninguno. | Persistir cada candidato, draw decisivo, patrón evaluado, resultado y revisión. | D12-D14 y auditoría reproducible. |

### Participantes, elegibilidad, asignaciones y consulta

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| Tabla `Participant` duplica nombre, documento, teléfono y código de afiliado. | DESCARTAR | Participar no debe requerir duplicar la persona. | Participación del evento referencia `Affiliate.id` cuando corresponda y un tipo de sujeto autorizado para beneficiario/empresa/invitado. | D02-D03: separar identidad de participación. |
| Un cartón tiene `participant_id` mutable y nullable; no hay entidad de participación ni historial. | REIMPLEMENTAR | Cartón sin asignar y asignación posterior son conceptos útiles. | Participación + asignación versionada; historial con actor, motivo, timestamp, evento/ronda y requestId. | D04-D05: máximo configurable y freeze al iniciar. |
| Eliminar participante deja cartón libre mediante `SET NULL`. | DESCARTAR | Ninguno como borrado destructivo. | Revocar/cancelar participación según política; conservar asignaciones históricas y evidencia. | D05, D13 y D17. |
| `/carton` busca por código, documento, teléfono, código de afiliado o número de cartón. | DESCARTAR | Mantener una experiencia sencilla de “mi cartón”, no sus credenciales débiles. | Sesión autenticada, documento+OTP o token de alta entropía según evento; autorización por recurso. | D06-D07 prohíben exactamente la consulta por dato único enumerable. |
| La vista pública muestra nombre completo, documento, código y matriz. | DESCARTAR | Mostrar el cartón autorizado y marcado en vivo. | DTO allowlist por superficie; anonimización configurada y cero documento/teléfono/dirección/correo público. | D18. |
| `/api/cards/{code}/state` es público y entrega llamadas/estado. | REIMPLEMENTAR | Snapshot del cartón autorizado. | Endpoint de autoservicio/token con scope; snapshot REST y realtime sin PII. | D06-D07, D18 y futura arquitectura SSE. |
| Búsqueda administrativa usa coincidencia parcial por nombre/documento/teléfono/código. | REIMPLEMENTAR | Operadores autorizados necesitan localizar participación/cartón. | Consultas paginadas por identificadores permitidos y permisos; auditar accesos sensibles. | D03, D10 y D18; no resolver identidad externa por coincidencias flexibles. |

### Importación y asignación

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| Importa únicamente XLSX, primera hoja, con aliases de encabezado y `Nombre` obligatorio. | REUTILIZABLE CON ADAPTACIÓN | Encabezados comprensibles, filas vacías ignoradas y reporte de errores. | Parser aislado para CSV/XLSX, esquema versionado, límites, errores por fila y preview. | D15 exige ambos formatos y pipeline completo. |
| Lee todo el upload en memoria y abre con OpenPyXL sin límites explícitos. | DESCARTAR | Ninguno. | Cuarentena, magic bytes, hash SHA-256, tamaño/hojas/filas/columnas/celdas, cifrado, macros, vínculos, fórmulas, ZIP bombs y corrupción. | D15-D16. |
| Archivo → objetos ORM → asignación → commit, sin staging ni aprobación. | DESCARTAR | Ninguno de este flujo directo. | Carga → validación → staging → preview → aprobación → aplicación por transacción/batches recuperables. | D15. |
| Si no encuentra documento/teléfono crea `Participant` automáticamente. | DESCARTAR | Registrar una fila no resuelta como novedad. | Resolver exclusivamente contra identidades existentes/autorizadas; fila no resuelta queda en staging/error. | D03 y D15 prohíben crear personas automáticamente. |
| Si no se indica cartón, asigna el siguiente libre; si se indica, comprueba que exista y esté libre/del mismo participante. | REUTILIZABLE CON ADAPTACIÓN | Asignación explícita o automática con conflicto visible. | Política de asignación determinista, máximo por evento, idempotencia, historial y freeze. | D04-D05. |
| Errores por fila se agregan solo como contador; excepciones se silencian ampliamente. | DESCARTAR | Mostrar conteos finales. | Código/mensaje/campo por fila, estado de batch, descarga de errores, trazas seguras y reintento controlado. | D15 y auditoría. |
| No hay prevención de reimportación. | REIMPLEMENTAR | Ninguno. | Hash de archivo + clave de idempotencia + estado de batch; permitir reaplicar solo con autorización explícita. | D15. |
| Exportaciones usan `safe_cell` para prefijar `=`, `+`, `-`, `@`. | REUTILIZABLE CON ADAPTACIÓN | Neutralizar formula injection en CSV/XLSX exportado. | Sanitizador central probado, aplicable a cada formato y campo no confiable. | D15 y seguridad de reportes. |
| Exporta participantes, cartones, ganadores y llamadas con PII para cualquier admin local. | REIMPLEMENTAR | Reportes operativos segmentados. | DTOs/export jobs con permisos específicos, minimización, auditoría, límites y retención. | D10, D17-D18. |

### Reinicios y preservación histórica

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| `restart` crea otro `Bingo`, copia matrices/asignaciones, genera nuevos códigos y conserva el anterior. | REUTILIZABLE CON ADAPTACIÓN | Nunca borrar balotas, ganadores ni la ejecución anterior; reutilizar configuración/cartones cuando la política lo permita. | Nueva `RoundExecution`/revisión relacionada con la anterior, estado cancelado, motivo, actor, aprobación y evidencia; no duplicar el evento. | D13 define explícitamente este modelo. |
| La única relación entre original y copia queda como texto `new_bingo_id` en `AuditLog`. | REIMPLEMENTAR | Trazabilidad del origen. | FK `previousExecutionId`/cadena de revisión y auditoría estructurada. | D13. |
| No exige estado, motivo ni supervisor para reiniciar. | DESCARTAR | Ninguno. | Comando sensible autorizado, idempotente y opcionalmente aprobado por supervisor. | D10-D11 y D13. |
| Copia asignaciones aunque el evento ya hubiera iniciado. | REIMPLEMENTAR | Una nueva ejecución puede conservar el universo aprobado según regla explícita. | Snapshot/inmutabilidad de participación y asignaciones al inicio; política de nueva ejecución definida antes de operar. | D05 y D13. |

### Interfaz y tiempo real

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| Tablero 1–75, última balota, recientes, controles de operación y proyección responsive. | REUTILIZABLE CON ADAPTACIÓN | Jerarquía operativa clara, tablero visible y soporte para proyección/móvil. | Rutas React lazy, componentes `packages/ui`, tokens, accesibilidad, foco/teclado y reduced motion. | D08-D09; integrar `/admin/bingo`, no una SPA/Jinja paralela. |
| Cartón digital marca centro/números llamados automáticamente. | REUTILIZABLE CON ADAPTACIÓN | Actualización en vivo del cartón autorizado. | Snapshot REST + SSE, secuencia y resync; DTO sin PII. | D06-D07, D16, D18 y D20. |
| Operador hace polling cada 1,2 s y cartón público cada 1,5 s. | REIMPLEMENTAR | Reconexión periódica como fallback controlado. | SSE principal, Redis Pub/Sub para fan-out y PostgreSQL como verdad; `Last-Event-ID` y snapshot. | D16/D20: polling masivo no sirve para 10.000 espectadores. |
| `winnerCandidates.innerHTML` interpola nombre y documento provenientes de datos persistidos. | DESCARTAR | Ninguno de la técnica de render. | Render React escapado, sin `dangerouslySetInnerHTML`, y DTO administrativo mínimo. | Riesgo XSS almacenado; D18 prohíbe PII innecesaria incluso en eventos realtime. |
| Jinja autoescapa valores de plantillas y `tojson` se usa para el código del cartón. | REUTILIZABLE CON ADAPTACIÓN | Escape contextual de contenido no confiable. | Escape normal de React, validación DTO y CSP compatible. | No trasladar plantillas; conservar el principio. |
| Sonido y overlay anuncian candidatos, pero falta un flujo accesible completo. | REUTILIZABLE CON ADAPTACIÓN | Señal audiovisual y confirmación explícita. | Live regions, foco administrado, alternativa no sonora, teclado y motion reducido. | Calidad enterprise y D11-D12. |
| CSS/logo imitan marca ASODEF localmente. | REUTILIZABLE CON ADAPTACIÓN | Intención visual y activo oficial si se valida su procedencia. | Componentes/tokens reales de ASODEF y launcher Herramientas. | D08-D09; no crear un sistema de diseño paralelo. |

### Persistencia, auditoría, autenticación y seguridad

| Función actual y evidencia | Clasificación | Comportamiento que debemos conservar | Implementación objetivo ASODEF | Cambio necesario por decisiones aprobadas |
| --- | --- | --- | --- | --- |
| SQLite local con WAL y un archivo `data/bingo.db`. | DESCARTAR | Ninguno de la tecnología. | Prisma/PostgreSQL autoritativo dentro de ASODEF; Redis solo distribución. | D16 y D20; concurrencia y operación multi-proceso. |
| `Base.metadata.create_all` y ALTER/TRIGGER en startup sustituyen migraciones. | DESCARTAR | Ninguno. | Migraciones Prisma aditivas, revisables y probadas desde vacío/staging. | Compatibilidad productiva y rollback expand-only. |
| `AuditLog` guarda usuario, acción, tipo/id y detalles de texto. | REUTILIZABLE CON ADAPTACIÓN | Toda acción relevante debe producir trazabilidad. | AuditLog existente ASODEF + evidencia de dominio con before/after, resultado, motivo, requestId, idempotencia, IP/UA cuando aplique. | D10-D17. El texto libre actual no es evidencia suficiente. |
| Llamadas y ganadores tienen evidencia propia además del audit log. | REUTILIZABLE CON ADAPTACIÓN | Evidencia de dominio independiente de auditoría genérica. | Entidades append-only de draw, candidato, ganador y revisión. | D12-D14 y D17. |
| Usuario admin local, contraseña PBKDF2 y cookie de sesión propia. | DESCARTAR | Ninguno de la autenticación paralela. | Sesión/RBAC/guards/decorators ASODEF existentes. | D03 y D10. |
| Todos los administradores tienen el mismo poder. | DESCARTAR | Ninguno. | Permisos concretos para lectura, gestión, operación, validación, importación, exportación y auditoría. | D10-D11. |
| Cookie se configura `https_only=False`, SameSite Lax; comandos POST no usan token CSRF. | DESCARTAR | Ninguno. | Protección CSRF específica compatible con ASODEF, cookies seguras y revisión de CORS/origin para comandos. | Seguridad productiva. |
| No hay rate limiting, idempotency key, límites de payload ni DTOs de allowlist. | REIMPLEMENTAR | Ninguno. | Guards/pipes/interceptors existentes, límites por superficie y claves de idempotencia. | D07, D10, D15-D16 y D18. |
| El código público es predecible y las búsquedas revelan si documento/teléfono/cartón existe. | DESCARTAR | Ninguno. | Tokens de alta entropía, respuestas anti-enumeración, rate limit y sesión/OTP según evento. | D06-D07 y D18. |
| No hay política de retención; el backup recomendado es copiar el archivo entero. | REIMPLEMENTAR | Conservar evidencia y poder restaurar. | Retención por tipo/evento con mínimos, jobs auditados, backups PostgreSQL y restauración probada. | D17 y D20. |
| Dependencias Python y servidor Uvicorn forman el runtime. | DESCARTAR | Ninguno. | Dependencias existentes del monorepo; evaluar nuevas solo con justificación y escaneo. | No mantener FastAPI ni otra aplicación. |

## Correspondencia funcional resumida

| Función actual | Comportamiento a conservar | Implementación objetivo ASODEF | Cambio por las decisiones |
| --- | --- | --- | --- |
| Crear “bingo” | Configurar evento, modalidad y premio antes de operar. | Evento con rondas, premios y revisiones. | D01, D11-D12. |
| Generar cartones | B-I-N-G-O 75, centro libre, unicidad. | Dominio TypeScript, RNG criptográfico, constraints e índices. | D04, D14, D16. |
| Asignar por Excel | Importación masiva con errores visibles. | Staging CSV/XLSX, resolución de identidades y aprobación. | D02-D05, D15. |
| Sacar balota | Elegir entre restantes sin repetición. | Transacción PostgreSQL bloqueada e idempotente. | D12-D14, D20. |
| Detectar ganador | Evaluar todos los cartones elegibles. | Máscaras/índices benchmarkeados; candidatos persistidos. | D02, D12, D16. |
| Confirmar ganador | Validar y conservar actor/balota decisiva. | Simple o doble control y evidencia append-only. | D11-D12, D17-D18. |
| Reiniciar | No borrar historia. | Nueva revisión relacionada y autorizada. | D13. |
| Consulta de cartón | Cartón digital actualizado. | Sesión/OTP/token seguro, snapshot y SSE sin PII. | D06-D07, D16, D18. |
| Tablero | Proyección, controles, recientes y alertas. | React/`packages/ui`, SSE y rutas nativas. | D08-D09, D16, D19-D20. |
| Reportar/exportar | Historial, cartones, ganadores y evidencia. | Reportes autorizados, auditados y con retención. | D10, D17-D18. |

## Elementos a conservar conceptualmente

1. Reglas B-I-N-G-O de 75 balotas, rangos por columna y centro libre.
2. Unicidad de matrices por evento y de balotas por ejecución.
3. Selección criptográfica exclusivamente entre balotas restantes.
4. Línea, dos líneas, esquinas, lleno y patrón configurable, una vez formalizada su semántica.
5. Detección de todos los candidatos que completan con la misma balota.
6. Pausa ante candidatos y confirmación explícita.
7. Balota decisiva, actor y timestamp como evidencia.
8. Inmutabilidad de draws/ganadores y reinicio sin borrado.
9. Importación masiva con asignación explícita/automática y reporte por fila.
10. Tablero proyectable, cartón digital, PDFs/reportes y mitigación de formula injection.
11. Los siete tests legados como semillas de casos, no como cobertura suficiente.

## Elementos que deben reimplementarse

1. Todo acceso a datos, modelos y transacciones en NestJS/Prisma/PostgreSQL.
2. Generador de cartones bajo RNG criptográfico e interfaz testeable.
3. Motor de patrones con máscaras precalculadas y benchmarks.
4. Máquina de estados, revisiones de ronda, idempotencia y locks.
5. Participaciones/asignaciones referenciando entidades ASODEF y guardando historial.
6. Candidatos, ganadores, empates y doble control como dominio persistente.
7. Importación CSV/XLSX con cuarentena y staging.
8. React nativo con `packages/ui`; realtime SSE/Redis con snapshot PostgreSQL.
9. Auditoría estructurada, reportes, privacidad y retención.

## Elementos que deben descartarse

1. FastAPI/Uvicorn, SQLAlchemy, SQLite y la base local.
2. Jinja y JavaScript global como frontend separado.
3. Usuario administrador y sesión propios.
4. Consulta pública mediante documento, teléfono, código afiliado o número de cartón.
5. Duplicación de participantes/personas.
6. Inserción directa desde XLSX y creación automática de personas.
7. Códigos públicos con 16 bits aleatorios como garantía de acceso.
8. `innerHTML` con nombre/documento persistidos.
9. Estados de texto sin transición validada.
10. Reinicio como clon de evento sin relación estructural.
11. Detección completa mediante escaneo de JSON por cada balota.
12. Auditoría de texto libre como única trazabilidad.

## Riesgos verificados que la migración debe eliminar

| Riesgo | Evidencia legada | Control objetivo |
| --- | --- | --- |
| XSS almacenado | `app.js` compone `winnerCandidates.innerHTML` con nombre/documento. | Render escapado, DTO allowlist, CSP y pruebas XSS. |
| CSRF | POST administrativos sin token; cookie SameSite Lax. | Control CSRF aislado/compatible con ASODEF y validación de origin. |
| IDOR/enumeración | `/carton` acepta documento, teléfono, código y número; `/api/cards/{code}/state` es público. | Sesión/OTP/token fuerte, rate limit y respuestas no enumerables. |
| Exposición de PII | Vista pública muestra nombre y documento; candidato transporta documento. | Minimización y anonimización por superficie; no PII en SSE. |
| Concurrencia | Lectura de restantes y commit sin lock de ejecución/idempotencia. | PostgreSQL transaccional, locks, uniques, secuencia e idempotency key. |
| Ganador duplicado | Check-then-insert sin unique de ganador. | Constraint e idempotencia transaccional. |
| Importación hostil | Upload completo sin límites, staging, hash ni controles XLSX. | Pipeline D15 y cuarentena. |
| Identidad duplicada | Crea `Participant` por ausencia de coincidencia doc/teléfono. | Referencias estables ASODEF; no crear personas por importación. |
| Patrón inválido | JSON custom sin esquema; máscara vacía puede validar. | Validación estructural y freeze antes del inicio. |
| Evidencia incompleta | Candidato recalculado; balota decisiva tomada al confirmar. | Candidato persistido y FK al draw decisivo. |
| Escala | Scan de matrices JSON y polling frecuente. | Bitmasks/índices benchmarkeados, SSE y Redis fan-out. |
| Retención/rollback | Solo copia manual del archivo SQLite. | Políticas, backup/restauración PostgreSQL y rollback por flags. |

## Decisiones funcionales que aún requieren confirmación

Estas preguntas no bloquean la conservación de las reglas ya aprobadas, pero sí deben cerrarse antes de congelar el motor:

1. Si “línea” significa únicamente fila horizontal, como en el legado, o también columna y diagonal.
2. Si “dos líneas” significa dos filas horizontales o cualquier combinación de líneas admitidas.
3. Especificación y límites del editor de patrones: catálogo predefinido, máscaras arbitrarias o ambos.
4. Si una nueva ejecución reutiliza exactamente los mismos cartones/asignaciones o toma un snapshot nuevo según la causa del reinicio.
5. Qué tipos de invitados/beneficiarios/participantes empresariales existen ya en ASODEF y cuál será su referencia estable.
6. Mínimos corporativos definitivos de retención y qué reportes pueden contener PII en áreas privadas.

## Criterio de migración

El legado debe tratarse como una especificación parcial de comportamiento y una fuente de casos de prueba. La implementación objetivo debe reescribir las reglas aprobadas dentro del dominio nativo de ASODEF. Ningún módulo Python, tabla SQLite, autenticación local, plantilla Jinja o endpoint legado debe quedar en el runtime productivo.
