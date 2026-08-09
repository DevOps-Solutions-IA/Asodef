# Estrategia de calidad, seguridad, rendimiento y regresión de Bingo

## 1. Propósito y alcance

Este documento define cómo demostrar que la integración nativa de Bingo es correcta, segura, operable y compatible con ASODEF. No acredita ninguna funcionalidad Bingo como implementada: establece gates, datos, métricas y evidencia que deberán satisfacerse a medida que existan el dominio, las APIs y las superficies de usuario.

Quedan fuera de este cambio el modelo Prisma de Bingo, el motor de sorteo, RBAC, APIs, SSE, frontend e infraestructura productiva. Tampoco se agregan dobles de prueba para simular esas capacidades.

### 1.1 Hechos verificados en el repositorio

- La API usa Jest y pruebas de integración junto a PostgreSQL y Redis reales.
- Web y los paquetes usan Vitest.
- Playwright ejecuta los flujos E2E contra la API compilada y el frontend construido.
- GitHub Actions crea PostgreSQL y Redis aislados, despliega las migraciones desde una base vacía, ejecuta el seed tres veces y después corre lint, typecheck, tests, build y E2E.
- La API aplica `helmet` y un `ValidationPipe` global con `whitelist: true` y `forbidNonWhitelisted: true`.
- ASODEF cuenta con guards/decorators de permisos en backend y `PermissionRoute`/`RoleRoute` en web.
- El autoservicio tiene protección CSRF explícita y rotación de token. La protección de comandos administrativos Bingo todavía debe aprobarse e implementarse.
- No existe hoy un harness de carga versionado para los objetivos de 50.000 cartones o 10.000 conexiones SSE.

### 1.2 Principios de validación

1. PostgreSQL es la fuente de verdad. Redis y SSE se prueban como mecanismos de distribución y recuperación, nunca como autoridad.
2. Los tests unitarios prueban reglas deterministas; no sustituyen pruebas transaccionales contra PostgreSQL.
3. Un mock puede aislar una dependencia en una prueba unitaria, pero no acredita una ruta, persistencia, autorización, concurrencia ni tiempo real como terminados.
4. Cada operación crítica debe comprobar resultado de dominio, constraints, auditoría, idempotencia y ausencia de efectos laterales.
5. La regresión completa de ASODEF es un gate, no una actividad opcional posterior.
6. Los resultados de rendimiento son válidos únicamente si incluyen commit, configuración, dataset, hardware, concurrencia, duración y percentiles.

## 2. Trazabilidad y evidencia

Cada requisito tendrá un identificador estable:

- `SEC-*`: seguridad.
- `CON-*`: concurrencia y consistencia.
- `PERF-*`: rendimiento y capacidad.
- `REG-*`: regresión ASODEF.
- `OPS-*`: observabilidad, recuperación y operación.

Toda ejecución de release debe conservar:

- SHA y rama;
- workflow y fecha;
- versión de esquema/migraciones;
- configuración no secreta y feature flags;
- versión y checksum del dataset;
- topología y recursos del entorno;
- comandos ejecutados y duración;
- resultados JUnit/Playwright y artefactos de fallo;
- reporte de carga con latencias, throughput, errores y uso de recursos;
- consultas de verificación de invariantes;
- incidentes o desviaciones aceptadas, con responsable y vencimiento.

Ninguna clave, cookie, token, documento, teléfono, correo o fila real de afiliado puede aparecer en los artefactos.

## 3. Entornos y datasets

### 3.1 Entornos

| Entorno             | Uso                                          | Datos                               | Gate permitido     |
| ------------------- | -------------------------------------------- | ----------------------------------- | ------------------ |
| Unitario            | Reglas puras y DTOs                          | Fixtures mínimas deterministas      | Pull Request       |
| Integración CI      | Constraints, transacciones, API, Redis       | Sintéticos y aislados por ejecución | Pull Request       |
| E2E CI              | Flujos críticos sobre builds productivos     | Seed E2E sintético                  | Pull Request       |
| Rendimiento aislado | Benchmarks y carga reproducible              | Dataset sintético versionado        | Pre-staging        |
| Staging             | Ensayo de arquitectura productiva y rollback | Sintético o anonimizado aprobado    | Go-live            |
| Producción          | Smoke controlado y observabilidad            | Real, sin pruebas destructivas      | Activación gradual |

Las cargas de rendimiento no se ejecutarán contra la base de desarrollo compartida ni contra producción. El entorno debe tener límites conocidos y no compartir CPU/IO con otros trabajos.

### 3.2 Familias de datos sintéticos

- `BINGO-SMALL`: 100 participantes, 100 cartones, modalidades y estados completos; uso funcional.
- `BINGO-5K`, `BINGO-10K`, `BINGO-25K`, `BINGO-50K`: igual número máximo de participantes y cartones, con distribución configurable de uno a cinco cartones.
- `BINGO-TIES`: patrones preparados para producir 0, 1, 2, 10 y muchos ganadores con la misma balota decisiva.
- `BINGO-CONTENTION`: múltiples actores, idempotency keys repetidas/diferentes y barreras de inicio simultáneo.
- `BINGO-IMPORT-VALID`: CSV y XLSX válidos en límites y en tamaños progresivos.
- `BINGO-IMPORT-HOSTILE`: archivos truncados/cifrados, magic bytes falsos, ZIP bomb segura de laboratorio, exceso de hojas/filas/columnas, celdas largas, macros, vínculos externos y fórmulas.
- `BINGO-PRIVACY`: marcadores únicos para documento, teléfono y correo que permiten detectar filtraciones sin usar PII real.

La generación debe ser reproducible mediante una semilla de prueba registrada. Los cartones de corrección incluyen un oráculo independiente con patrones y ganadores esperados; el motor bajo prueba no genera sus propios resultados esperados.

## 4. Matriz de seguridad

| ID      | Riesgo/superficie              | Validación obligatoria                                                                                                                                                                   | Criterio de aprobación                                                                                                                                                       |
| ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | RBAC administrativo            | Probar cada endpoint con cada permiso relevante, sin sesión, con permiso insuficiente y con permiso correcto. Probar que el rol agrupa permisos pero el controller autoriza por permiso. | 401 sin autenticación; 403 sin permiso; éxito solo con el permiso exacto; ningún cambio ni auditoría de éxito en solicitudes rechazadas.                                     |
| SEC-002 | Separación operador/supervisor | En rondas de doble control, intentar operar y validar con el mismo `userId`, aunque posea ambos permisos.                                                                                | Rechazo transaccional; candidato permanece pendiente; intento auditado; otro supervisor autorizado puede validar.                                                            |
| SEC-003 | IDOR administrativo            | Alterar `eventId`, `roundId`, `executionId`, `cardId`, `participantId`, `importId` y `winnerId` entre eventos.                                                                           | 404/403 según política uniforme; cero lectura o mutación cruzada; sin señal útil para enumerar recursos.                                                                     |
| SEC-004 | IDOR afiliado                  | Un afiliado intenta consultar cartones, participación o tokens de otro.                                                                                                                  | La identidad se deriva de sesión a `Affiliate.id`; identificadores del payload no cambian el sujeto; cero PII o cartones ajenos.                                             |
| SEC-005 | CSRF administrativo            | POST/PUT/PATCH/DELETE críticos con token ausente, inválido, reutilizado/expirado y origen no permitido; validar cookies SameSite y CORS.                                                 | Todo comando falla antes de mutar. La protección elegida queda documentada y probada end-to-end; no se acepta depender solo del frontend.                                    |
| SEC-006 | CSRF autoservicio              | Repetir las pruebas existentes de token explícito/rotado para cualquier mutación Bingo del afiliado.                                                                                     | Token unido a la sesión y rotado conforme al patrón; ausencia o replay inválido no muta estado.                                                                              |
| SEC-007 | XSS almacenado/reflejado       | Inyectar HTML, SVG, atributos, URLs peligrosas y secuencias Unicode en nombres configurables, motivos, importaciones y mensajes.                                                         | Se renderizan como texto; no se usa `dangerouslySetInnerHTML`; CSP/headers acordados; cero ejecución en Playwright.                                                          |
| SEC-008 | Enumeración                    | Barrer slugs, tokens, referencias, cartones y endpoints de consulta; comparar códigos, cuerpo y tiempos.                                                                                 | Tokens de alta entropía; rate limit; respuestas no revelan existencia ni PII; diferencias temporales no son explotables dentro del umbral aprobado.                          |
| SEC-009 | PII REST                       | Inspeccionar DTOs públicos, de afiliado y administrativos mediante allowlists y snapshots contractuales.                                                                                 | Público nunca contiene documento, teléfono, dirección o correo; autoservicio contiene solo datos propios necesarios; no se serializan modelos Prisma completos.              |
| SEC-010 | PII SSE/Redis                  | Insertar marcadores `BINGO-PRIVACY`, capturar frames, canales Redis y logs.                                                                                                              | Ningún marcador sensible aparece; eventos contienen identificadores públicos/estado mínimo; Redis no persiste PII.                                                           |
| SEC-011 | Rate limiting                  | Ráfagas por IP, sesión, actor, evento y token en consultas, login/OTP, imports y comandos críticos; probar `Retry-After`.                                                                | Se obtiene 429 según política, sin mutación parcial; límites administrativos no permiten evadir idempotencia; usuarios tras NAT no quedan bloqueados globalmente por diseño. |
| SEC-012 | Mass assignment                | Agregar campos desconocidos y sensibles (`status`, `winner`, `affiliateId`, `drawnBall`, `createdBy`, políticas congeladas).                                                             | 400 por `forbidNonWhitelisted`; DTOs no exponen campos controlados por servidor; DB sin cambios.                                                                             |
| SEC-013 | Sesión expirada/revocada       | Expirar/revocar sesión antes y durante comando, snapshot y reconexión SSE.                                                                                                               | Nuevos comandos/conexiones fallan; ninguna transición parcial; stream se cierra o deja de autorizar según contrato; reautenticación requerida.                               |
| SEC-014 | Payload sobredimensionado      | JSON, query, headers, SSE cursor y upload por encima de límites, compresión abusiva y nesting profundo.                                                                                  | Rechazo temprano 413/400, memoria estable, sin archivo/staging huérfano y con logging sanitizado.                                                                            |
| SEC-015 | CSV/XLSX hostil                | Ejecutar `BINGO-IMPORT-HOSTILE`, validar magic bytes, ZIP, hojas, filas, columnas, celdas, cifrado, macros y links.                                                                      | Cuarentena/rechazo antes de aplicar; reporte seguro; cero persona creada; cero mutación del evento; archivo eliminado por retención.                                         |
| SEC-016 | Formula injection              | Celdas iniciadas por `=`, `+`, `-`, `@`, tab/CR y variantes Unicode tanto en import como en export.                                                                                      | No se evalúan fórmulas importadas; exports neutralizan contenido; abrir fixture en hoja de cálculo no ejecuta fórmula/enlace.                                                |
| SEC-017 | Tokens y secretos              | Revisar entropy, expiración, binding, hashing y logs para consulta segura/commit-reveal.                                                                                                 | Token no enumerable ni almacenado en claro cuando no sea necesario; secretos/semillas no se revelan antes de la fase autorizada.                                             |
| SEC-018 | Auditoría y logs               | Provocar éxitos, rechazos, conflictos, errores de importación y payloads sensibles.                                                                                                      | Auditoría conserva actor/request/idempotency/motivo/transición; logs no contienen PII, cookies, tokens, claves ni archivo completo.                                          |
| SEC-019 | Feature flags                  | Acceder directamente con navegación oculta y combinar flags admin/afiliado/público/evento.                                                                                               | Backend bloquea cada superficie deshabilitada; no basta ocultar UI; ASODEF restante continúa saludable.                                                                      |
| SEC-020 | Dependencias y supply chain    | Lockfile congelado, auditoría de dependencias y revisión específica de parser XLSX/CSV.                                                                                                  | Sin vulnerabilidad crítica/alta explotable sin mitigación aprobada; hashes/lockfile no cambian incidentalmente.                                                              |

Las pruebas negativas deben verificar tanto la respuesta como el estado posterior en PostgreSQL, auditoría y almacenamiento temporal.

## 5. Matriz de concurrencia y consistencia

Las pruebas `CON-*` deben usar PostgreSQL real. Para simultaneidad se usa una barrera que libera clientes separados a la vez; no basta una sucesión de promesas sin sincronización. Cada escenario se repite al menos 50 veces en CI especializada y 500 veces en el soak pre-staging, con idempotency keys y request IDs registrados.

| ID      | Escenario                                                         | Oráculo                                           | Criterio de aprobación                                                                                                |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CON-001 | Dos operadores extraen a la vez en la misma ejecución             | Constraints + secuencia persistida                | No hay balota ni secuencia duplicada; una transición válida por comando; conflicto explícito para el perdedor.        |
| CON-002 | Dos operadores ejecutan comandos incompatibles (draw/pause/close) | Máquina de estados                                | Solo una serialización legal; nunca aparece un estado imposible; auditoría coincide con el orden comprometido.        |
| CON-003 | Reintento con la misma idempotency key y payload                  | Registro idempotente                              | Una mutación y una evidencia; todos los reintentos reciben resultado equivalente.                                     |
| CON-004 | Misma key con payload diferente                                   | Hash del comando                                  | 409/422 según contrato; no se reutiliza la respuesta anterior ni se muta estado.                                      |
| CON-005 | Timeout del cliente después del commit                            | Snapshot PostgreSQL                               | El reintento recupera el resultado comprometido; no repite la extracción.                                             |
| CON-006 | Varios cartones completan con la misma balota                     | Oráculo `BINGO-TIES`                              | Se persisten todos los candidatos con igual balota decisiva y secuencia; ninguno se elige arbitrariamente.            |
| CON-007 | Validaciones simultáneas de un ganador                            | Unique/estado + política de control               | Una decisión efectiva; reintentos idempotentes; decisiones contradictorias producen conflicto y evidencia.            |
| CON-008 | Mismo operador intenta validar en doble control                   | Actor de operación vs validación                  | Rechazo incluso con ambos permisos; no hay ganador confirmado.                                                        |
| CON-009 | Reinicio concurrente con operación activa                         | Revisión inmutable                                | Se crea a lo sumo una nueva revisión autorizada; anterior se conserva cancelada; ninguna extracción se mueve o borra. |
| CON-010 | Reasignación concurrente con inicio de ronda                      | Lock/estado de asignación                         | O reasignación completa antes de iniciar, o rechazo completo; jamás cambia asignación después del inicio.             |
| CON-011 | Dos aplicaciones de un import aprobado                            | Batch + idempotencia                              | Una aplicación lógica, sin participantes/cartones duplicados; conteos y errores deterministas.                        |
| CON-012 | Redis cae entre commit y publicación                              | PostgreSQL + outbox/mecanismo aprobado + snapshot | Estado comprometido recuperable; reconexión/resync entrega la secuencia correcta; Redis no decide rollback.           |
| CON-013 | Dos procesos API publican/consumen                                | Secuencia global                                  | Clientes pueden deduplicar y ordenar; no pierden estado porque REST snapshot cubre gaps.                              |
| CON-014 | Cambio de ronda durante reconexión                                | Cursor con contexto de evento/ejecución           | El cliente descarta contexto obsoleto y carga snapshot vigente sin mezclar balotas.                                   |
| CON-015 | Política o premio se modifica al iniciar/tras candidato           | Estado congelado                                  | Operación rechazada; política usada por el motor coincide con la versión previa al inicio.                            |

Invariantes adicionales que se consultan después de cada corrida:

- una balota y una secuencia únicas por ejecución;
- secuencia monotónica sin evidencia huérfana;
- como máximo una ejecución activa compatible por ronda;
- draws, candidatos y ganadores referencian la misma ejecución/ronda/evento;
- no hay asignación efectiva posterior al freeze;
- el número de auditorías y evidencias coincide con comandos comprometidos y rechazados auditables;
- ninguna fila crítica desaparece durante restart/cancelación.

## 6. Estrategia de rendimiento y capacidad

### 6.1 Metodología

1. Establecer una línea base en commit fijo, con PostgreSQL `ANALYZE` y caches frías/calientes diferenciadas.
2. Ejecutar `BINGO-5K`, `10K`, `25K` y `50K` en ese orden. Un nivel fallido detiene la promoción, no se oculta bajando el dataset.
3. Separar benchmark puro de detección, transacción de extracción, snapshot REST, importación y fan-out SSE.
4. Hacer warm-up de 2 minutos, medición mínima de 10 minutos y soak de 60 minutos en el máximo aprobado.
5. Registrar p50/p95/p99/máximo, throughput, errores, locks, conexiones, CPU, RSS/heap, GC, IO, WAL, queries y Redis.
6. Comparar con la línea base del mismo entorno. Las ejecuciones en portátiles orientan; solo staging comparable puede aprobar go-live.

No se selecciona todavía una herramienta de carga. Antes de incorporarla debe revisarse mantenimiento, licencia, soporte SSE, salida machine-readable y compatibilidad con CI; su incorporación será un cambio revisable independiente.

### 6.2 Presupuestos de aprobación objetivo

Estos presupuestos son gates iniciales de ingeniería y deben confirmarse con la capacidad real de staging/VPS, sin relajar corrección o seguridad:

| ID       | Medición                                                                       | Objetivo inicial                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-001 | Evaluación determinista de patrones sobre 50.000 cartones, excluyendo IO       | p95 <= 250 ms y p99 <= 500 ms por balota en hardware de benchmark documentado.                                                                                                                                                                     |
| PERF-002 | Comando de extracción completo contra PostgreSQL, sin tiempo de render cliente | p95 <= 750 ms, p99 <= 1.500 ms; cero error 5xx y cero violación de invariantes.                                                                                                                                                                    |
| PERF-003 | Snapshot público/autenticado de evento activo                                  | p95 <= 500 ms, p99 <= 1.000 ms; payload paginado/minimizado y sin PII.                                                                                                                                                                             |
| PERF-004 | Importación de 50.000 filas                                                    | Preview y aplicación completan dentro del timeout operativo aprobado; uso de memoria acotado, progreso observable y rollback/reanudación correctos. El tiempo objetivo definitivo se fija con el primer benchmark sin ocultar esperas indefinidas. |
| PERF-005 | 10.000 conexiones SSE en topología objetivo                                    | >= 99,9 % de conexiones útiles durante 60 min; p99 commit-a-evento <= 2 s; 0 evento irrecuperable; reconexión/resync <= 5 s p95.                                                                                                                   |
| PERF-006 | Cliente lento/desconectado                                                     | Memoria por proceso vuelve a la línea base tras desconexión; buffers tienen límite; un cliente lento no aumenta p95 global > 20 %.                                                                                                                 |
| PERF-007 | Redis Pub/Sub entre procesos                                                   | Ninguna inconsistencia de dominio; al cortar/restaurar Redis, snapshot recupera 100 % del estado y no duplica comandos.                                                                                                                            |
| PERF-008 | PostgreSQL bajo draw + snapshot + administración                               | Pool sin agotamiento sostenido; lock wait p99 < 1 s; deadlocks no recuperados = 0; replica futura no es requisito para corrección.                                                                                                                 |
| PERF-009 | Regresión entre commits                                                        | Ningún percentil crítico empeora > 20 % sin explicación y aprobación; corrección siempre tiene prioridad sobre throughput.                                                                                                                         |
| PERF-010 | VPS durante ensayo equivalente al evento                                       | CPU sostenida < 75 %, memoria < 80 %, almacenamiento < 80 %, sin swap thrashing; margen documentado para ASODEF no Bingo.                                                                                                                          |

### 6.3 Perfiles de carga

- Operación: uno a cinco operadores, baja tasa pero alta criticidad y contención intencional.
- Espectadores: ramp-up 1k/2.5k/5k/10k; conexiones mantenidas, reconexión escalonada y tormenta controlada.
- Snapshots: carga inicial y recuperación del 1 %, 10 % y 100 % de espectadores.
- Administración: lectura de listados/reportes durante sorteo sin bloquear extracción.
- Imports: validación y aplicación fuera y durante una sesión pública, respetando políticas operativas.
- Soak: 60 minutos con draws, pausas, cambios de ronda, desconexiones Redis y clientes lentos.

Métricas mínimas por componente:

- API/Node: event-loop lag, heap/RSS, GC, handles, respuestas por status y latencia por ruta.
- PostgreSQL: conexiones, locks/deadlocks, slow queries, buffers, temp files, WAL, CPU/IO y crecimiento de tablas/índices.
- Redis: conexiones, pub/sub clients, buffers, memoria, dropped/rejected connections y latencia.
- Nginx: conexiones activas, upstream latency, 4xx/5xx/499, timeouts y límites de buffering SSE.
- VPS: CPU por proceso, RAM/swap, disco/IOPS, red, file descriptors y conntrack.

## 7. Tiempo real, recuperación y resiliencia

| ID      | Prueba                                              | Criterio de aprobación                                                                                                                |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| OPS-001 | Conexión inicial SSE + snapshot                     | El snapshot identifica secuencia/ejecución; los eventos posteriores continúan sin gap.                                                |
| OPS-002 | `Last-Event-ID` válido                              | Reanuda o fuerza resync conforme al contrato, sin mezclar evento/ronda/ejecución.                                                     |
| OPS-003 | Cursor antiguo, futuro o inválido                   | Respuesta controlada y snapshot; sin stack trace, PII ni stream inconsistente.                                                        |
| OPS-004 | Corte de red y reconexión exponencial               | Recuperación dentro del presupuesto; sin tormenta ilimitada ni pérdida definitiva.                                                    |
| OPS-005 | Redis no disponible                                 | Comandos confirmados permanecen válidos; health/readiness reflejan degradación; REST sigue siendo vía de recuperación según política. |
| OPS-006 | Proceso API termina                                 | Clientes reconectan a otro proceso cuando exista; ningún estado autoritativo se pierde.                                               |
| OPS-007 | Backpressure/cliente lento                          | Buffer acotado, desconexión explícita y resync posterior; memoria estable.                                                            |
| OPS-008 | Feature flag deshabilitado durante evento de prueba | Nuevos comandos/conexiones se bloquean ordenadamente; datos se conservan; resto de ASODEF no se afecta.                               |
| OPS-009 | Logs y métricas                                     | Cada fallo se correlaciona por request/event/round/execution sin exponer PII.                                                         |

## 8. Matriz de regresión ASODEF

La suite existente continúa ejecutándose completa. A medida que Bingo toque puntos centrales, se añaden casos focalizados sin reemplazar los actuales.

| ID      | Área que no puede romperse                               | Evidencia mínima por PR Bingo                          | Gate ampliado antes de staging                                        |
| ------- | -------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| REG-001 | Login, logout, refresh, lockout, recuperación y sesiones | API auth + web unit + E2E admin                        | Expiración/revocación y cookies en navegador real.                    |
| REG-002 | Administración, usuarios, roles y permisos               | Tests controller/guards/seeds + rutas admin            | Matriz positiva/negativa de roles y navegación responsive.            |
| REG-003 | CRM, leads y oportunidades                               | Suites API existentes                                  | Flujo E2E representativo y auditoría.                                 |
| REG-004 | Empresas y portal empresarial                            | API/web existentes + `admin-companies`                 | Login/aislamiento de empresa y operación representativa.              |
| REG-005 | Aliados/partners                                         | Suites API/web existentes                              | Lectura y administración autorizada.                                  |
| REG-006 | Pagos, órdenes, recibos y lookup                         | Suites API/payments/web                                | Flujo real de modo CI, idempotencia y comprobante.                    |
| REG-007 | Webhooks Bold                                            | Integración webhook existente                          | Replay, firma, auditoría y no regresión de estados.                   |
| REG-008 | Conciliación, reversión y reembolsos                     | Suites API existentes                                  | Permisos, transiciones y evidencia.                                   |
| REG-009 | Legal, consentimientos y cookies                         | API/web + E2E legal/cookie                             | Publicación, aceptación/versionado y navegación pública.              |
| REG-010 | Solicitudes de datos y PQR                               | API/web + E2E data request/PQR                         | Radicación, consulta segura y flujo administrativo.                   |
| REG-011 | Afiliados y autoservicio                                 | Suites self-service e identidad PostgreSQL             | OTP/sesión/CSRF, aislamiento y lifecycle de identidad.                |
| REG-012 | Contenido y comunicaciones                               | Suites API/web existentes                              | Permisos, render seguro y plantillas.                                 |
| REG-013 | Reportes, auditoría y retención                          | Suites API existentes                                  | Exportación autorizada, evidencia y ejecución de retención sin Bingo. |
| REG-014 | Navegación, responsive, guards y 404                     | Tests router/layout + E2E route coverage               | Desktop/móvil, deep links y feature flags Bingo apagados.             |
| REG-015 | Rutas públicas, sitemap y SEO                            | Web unit + E2E public/smoke                            | Sitemap, robots/canonical según convención, 404 y páginas insignia.   |
| REG-016 | Health/readiness y bootstrap                             | Tests health/bootstrap + runtime CI                    | Degradación Redis/Bingo no derriba salud ajena según contrato.        |
| REG-017 | Migraciones y seeds                                      | Base vacía + deploy + tres seeds                       | Upgrade desde copia compatible de staging y rollback aplicativo.      |
| REG-018 | Build y paquetes compartidos                             | lint/typecheck/test/build de Turbo                     | Bundle productivo y consumo de `packages/ui`/`payments` intacto.      |
| REG-019 | Seguridad transversal                                    | Helmet, validation, CORS, auth y rate-limit existentes | DAST focalizado y revisión de headers/cookies/CSP.                    |
| REG-020 | Rendimiento no Bingo                                     | Health/login y una operación crítica por dominio       | Sin degradación > 20 % frente a baseline comparable.                  |

Un fallo `REG-*` bloquea integración/promoción aunque todas las pruebas Bingo pasen. Las expectativas solo cambian si el comportamiento ASODEF fue modificado y aprobado explícitamente; no se actualizan snapshots para ocultar regresiones.

## 9. Gates por nivel

### Gate Q0 — Cada commit

- Cambio enfocado y sin secretos/datos reales.
- Formato, lint y typecheck del alcance.
- Unitarias del dominio modificado.
- Sin `.only`, skips nuevos, retries para ocultar flakes ni TODO crítico.

### Gate Q1 — Pull Request

- `pnpm ci:check` completo.
- Migración limpia desde base vacía y seed repetible cuando aplique.
- Integración PostgreSQL/Redis del alcance.
- API 401/403/404/409/422 y contratos de privacidad.
- Playwright y matriz de regresión actual verdes.
- Build productivo.
- Revisión de permisos, DTOs, auditoría y feature flags.

### Gate Q2 — Cierre de etapa

- Todos los requisitos de la etapa enlazados a tests/evidencia.
- Concurrencia repetida sin flake ni violaciones.
- Amenazas nuevas añadidas a `SEC-*`.
- Documentación de operación/rollback actualizada.
- Sin mocks presentados como integración completa.

### Gate Q3 — Pre-staging

- Datasets 5K/10K/25K/50K reproducibles.
- Benchmarks de motor y PostgreSQL dentro de presupuesto.
- Escaneo de dependencias y parser de importación revisado.
- Pruebas hostiles CSV/XLSX.
- Plan de carga, observabilidad y rollback aprobado.

### Gate Q4 — Staging

- Topología equivalente a producción: Nginx, API, PostgreSQL, Redis, SSE y TLS.
- Migración y feature flags inicialmente apagados.
- 10.000 SSE o capacidad máxima evidenciada; si no se alcanza, go-live de ese volumen queda bloqueado.
- Fallos Redis/API/red, resync, clientes lentos y soak aprobados.
- Backup y restauración probados; rollback aplicativo conserva datos.
- Regresión completa y ensayo operacional de rondas/premios/empates.

### Gate Q5 — Producción gradual

- Aprobación explícita del propietario.
- Flags por superficie; primero administración controlada, luego afiliado/público según plan.
- Smoke no destructivo y dashboards/alertas activos.
- Criterios de abortar definidos: violación de invariantes, fuga PII, 5xx/latencia sostenida, pool agotado o pérdida de resync.
- Rollback primario mediante flags; nunca borrar evidencia ni revertir destructivamente el esquema.

## 10. Organización futura de pruebas

Se conservarán las convenciones existentes:

- reglas puras del motor junto a su módulo en specs Jest;
- constraints/concurrencia en specs de integración de API contra PostgreSQL;
- controllers y seguridad HTTP con Nest/Supertest;
- componentes, rutas y DTO clients con Vitest;
- journeys críticos y XSS/CSRF en Playwright;
- carga en un directorio/harness dedicado solo cuando se seleccione la herramienta.

Utilidades futuras aceptables:

- generador determinista de cartones/datasets separado del oráculo de ganadores;
- barrera reutilizable para concurrencia PostgreSQL;
- capturador SSE que valide secuencia, reconexión y ausencia de marcadores PII;
- generador seguro de fixtures CSV/XLSX hostiles sin archivos reales;
- recolector estándar de metadatos y percentiles del benchmark.

Cada utilidad debe tener tests propios y no importar servicios productivos para calcular la respuesta esperada. No se crea ninguna en este bloque porque todavía no existen los contratos de dominio, importación o SSE que deberían gobernar su API.

## 11. Responsabilidades y dependencias

- ETAPA 2 debe fijar el catálogo y las asignaciones antes de cerrar `SEC-001/002`.
- ETAPA 3 debe materializar constraints y estados antes de implementar `CON-*`.
- Motor + auditoría deben diseñarse juntos para que los tests comparen evidencia con estado comprometido.
- La decisión CSRF administrativa debe quedar resuelta antes del primer comando crítico.
- El contrato SSE debe definir secuencia/cursor/snapshot antes de construir el harness de 10.000 clientes.
- La importación debe fijar límites, parser y retención antes de versionar fixtures hostiles definitivos.
- La inspección de VPS y Nginx ocurre antes de establecer la capacidad productiva, no antes de diseñar para escala.

## 12. Definición de terminado de calidad

Una capacidad Bingo solo puede declararse terminada cuando:

1. sus requisitos tienen tests positivos, negativos y de autorización;
2. los invariantes críticos están reforzados y probados en PostgreSQL;
3. concurrencia e idempotencia se prueban con simultaneidad real;
4. DTOs y eventos cumplen las allowlists de privacidad;
5. auditoría y observabilidad permiten reconstruir el resultado;
6. feature flags y recuperación están verificadas;
7. la regresión ASODEF completa está verde;
8. no quedan fallos conocidos, skips, TODO críticos o pasos manuales no documentados;
9. para capacidades sensibles a escala, el nivel de dataset y concurrencia objetivo tiene evidencia reproducible;
10. la aprobación corresponde al gate requerido y no a una demostración local.
