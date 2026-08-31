# Auditoría de reproducibilidad del repositorio

Fecha de ejecución: 2026-08-06. Rama: `main`. HEAD inicial:
`5b9e5cc6735800a85ddb7697b4669eaa95d09d6e`.

Este documento registra evidencia del incidente de CI y el contrato de
reproducción. Los identificadores finales de commit y workflow se incorporan
solo después de que el mismo SHA termine en verde en GitHub Actions.

## Incidente reproducido

- Workflow fallido: run `31139538591`, job `92746308550`, SHA
  `5b9e5cc6735800a85ddb7697b4669eaa95d09d6e`, conclusión `failure`.
- Paso primario: `pnpm typecheck`, con 308 diagnósticos en `@asodef/api`.
- Fallo secundario: el teardown evaluaba el Compose principal sin
  `CONTRACT_DOWNLOAD_TOKEN_SECRET`, por lo que también terminaba con error.
- El job publicaba en su entorno valores efímeros que no habían sido
  registrados con `::add-mask::`. No eran credenciales productivas, pero la
  práctica hacía que los logs fueran innecesariamente sensibles.

La reproducción se hizo en `/tmp/asodef-clean-audit.cAWR0z/repo`, sin
`node_modules`, `.prisma`, outputs, caché de Turbo, base de datos, Redis,
archivos `.env` ni navegadores heredados:

| Fase | Resultado | Duración | Diagnósticos |
|---|---:|---:|---:|
| `pnpm install --frozen-lockfile` | PASS | 3.251 s | 0; postinstall advirtió que no encontró el schema por defecto |
| `pnpm lint` antes de generación explícita | PASS | 4.476 s | 0 |
| `pnpm typecheck` antes de generación explícita | FAIL | 3.514 s | 308 |
| `pnpm prisma:generate` | PASS | 1.655 s | 0 |
| `pnpm lint --force` después de generar | PASS | 4.256 s | 0 |
| `pnpm typecheck --force` después de generar | PASS | 7.040 s | 0 |

De los 308 diagnósticos, 188 eran símbolos Prisma ausentes y 103 eran
`implicit any` en cascada. Después de generar el cliente correcto quedaron
cero errores genuinos de TypeScript. Se revisaron expresamente sesión de
autoservicio, `allowedTargets` de PQR/DSR, webhooks, callbacks Prisma y clases
de error Prisma.

## Hallazgos y causa raíz

| Severidad | Hallazgo | Causa raíz | Corrección / estado |
|---|---|---|---|
| P1 | Checkout limpio no pasa typecheck | `@prisma/client` ejecuta postinstall desde el `INIT_CWD` raíz y no descubre `apps/api/prisma/schema.prisma`; deja el cliente stub con exit 0 | Dependencia explícita `prisma:generate` para cada consumidor API y paso de CI previo |
| P1 | Workflow no reconstruía la base ni publicaba el estado legal requerido por E2E | El job reutilizaba Compose de desarrollo y un seed limpio no publica documentos | Stack efímero, 34 migraciones, tres seeds y preparación E2E guardada mediante el workflow real de publicación |
| P1 | `prisma:seed` fallaba en Actions aunque pasaba en el workspace | El seed importa `@asodef/config` por sus exports compilados; lint/typecheck locales habían dejado `packages/config/dist`, pero el gate remoto llegaba sin ese artefacto | El comando de seed construye explícitamente su dependencia workspace y se verificó sin `dist` previo |
| P2 | Cola durable de reportes podía quedar en `PROCESSING` y el test dependía de polling/reloj | `processExportJob` redisparaba recuperación/reintento recursivamente y el test no esperaba la operación real | Barrido único, dispatch con errores observables y harness que espera exactamente las promesas internas |
| P2 | Formato de medianoche divergía entre Node 20 y Node 22 | `Intl` con `hour12: false` usa `24:00:00` en el ICU de Node 20 y `00:00:00` en Node 22 | `hourCycle: h23`, validado en ambos runtimes sin cambiar el instante UTC |
| P2 | La semilla no tenía prueba independiente de idempotencia | CI ejecutaba una sola vez sobre una base no demostrablemente vacía | Verificador fail-closed: tres ejecuciones, conteos y claves naturales estables |
| P2 | Teardown podía fallar antes de limpiar | Evaluación de variables obligatorias del Compose general | Compose mínimo aislado y cleanup limitado por project/labels |
| P2 | Dependencias con avisos críticos/altos alcanzables | Versiones antiguas directas/transitivas | Nodemailer/Vite/Vitest actualizados y overrides estrechos; suites completas requeridas |
| P3 | Contrato de entorno incompleto | Doce variables con defaults válidos no estaban en `.env.example` | Plantilla alineada y matriz inferior |
| P3 | Artefactos previos podían esconder la causa | Comandos del desarrollador reutilizaban `.prisma`, `dist` y Turbo local | Comando canónico con caché aislada/forzada y prueba en checkout limpio |

No se encontraron hallazgos P0.

## Mapa de artefactos generados

| Artefacto | Productor | Consumidores | Git | Caché / riesgo |
|---|---|---|---|---|
| `node_modules/.prisma/client` | `pnpm --filter api prisma:generate` | lint, typecheck, test y build de API | ignorado | No cacheable en Turbo; el schema es dependencia explícita |
| `apps/api/dist` | `pnpm --filter api build` | runtime compilado/Docker | ignorado | output Turbo; se borra y reconstruye en clean build |
| `apps/web/dist` | `pnpm --filter web build` | Vite preview/Nginx | ignorado | depende de `VITE_API_URL`, `VITE_APP_URL`, `NODE_ENV` |
| `packages/*/dist` + `.d.ts` + maps | `pnpm --filter <paquete> build` | workspaces API/web | ignorado | outputs Turbo; las importaciones pasan por exports públicos |
| `.turbo` | Turbo | comandos monorepo | ignorado | no es evidencia; CI parte sin caché de outputs |
| `coverage` | Jest/Vitest coverage | revisión local | ignorado | no requerido por build |
| `playwright-report`, `test-results` | Playwright | diagnóstico de fallo | ignorado | GitHub conserva artefactos por 7 días solo en fallo |
| OpenAPI runtime | `setupSwagger` al iniciar API no productiva | navegador Swagger | no se escribe | no es prerrequisito de compilación |
| CSV/PDF/storage | servicios de reportes, contratos, recibos y reembolsos | descargas autorizadas | ignorado | rutas configurables; nunca input de build |

No hay outputs generados rastreados. Los outputs construidos no son inputs
silenciosos de un checkout limpio.

## Prisma y base de datos

- CLI y cliente: `5.22.0`, misma resolución del lockfile.
- Schema: `apps/api/prisma/schema.prisma`.
- Migraciones: 34, orden lineal.
- Entidades representativas verificadas en el cliente: `User`,
  `SecurityEvent`, `LegalDocumentVersion`, `PaymentOrder`, `ApprovalGate`,
  `SelfServicePortal`, `SelfServiceChallengeStatus`.
- El CLI 5.22 no expone `prisma format --check`. La comprobación no mutante
  formateó una copia temporal y detectó alineación no canónica; el schema se
  normalizó mecánicamente, se regeneró y la segunda comparación fue idéntica.
- El verificador de base rechaza puertos/credenciales de desarrollo, exige
  una base vacía, aplica las 34 migraciones, consulta tablas, índices y
  foreign keys, y ejecuta el seed tres veces sin reset intermedio.

## Grafo de tareas

`@asodef/api#{lint,typecheck,test,build}` depende de `prisma:generate`.
Generación y tests de API no se restauran desde Turbo. El build web declara
las variables que alteran su output. `pnpm ci:check` es el gate de fuentes;
`pnpm ci:verify` usa PostgreSQL/Redis aislados, migraciones, seed, preparación
E2E, runtime compilado, preview construido y Chromium.

## Contrato de entorno

Leyenda: **R** requerido sin default; **D** default seguro; **C** condicional;
**S** secreto de runtime; **N** no secreto. CI usa valores efímeros y
enmascarados para cada variable S.

| Variable | Consumidor | Contrato | Dev/test/CI | Clase |
|---|---|---|---|---|
| `NODE_ENV` | API/web/scripts | enum development/test/production, D | development/test/development | N |
| `API_PORT` | API/CI | entero positivo, D 3000 | 3000/test/3100 | N |
| `APP_NAME`, `APP_DOMAIN`, `APP_TIMEZONE` | API | string, D | plantilla/default/default | N |
| `PUBLIC_APP_URL`, `PUBLIC_API_URL` | enlaces/API | URL, D | localhost | N |
| `DATABASE_URL` | Prisma/API | PostgreSQL URL, R | `.env`/fixture/efímera | S |
| `REDIS_URL` | Redis/API | Redis URL, R | local/fixture/efímera | S |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | auth | min 16, R | plantilla sintética/fixture/efímera | S |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | auth | duración, D 15m/7d | default | N |
| `ENCRYPTION_KEY` | crypto | min 32, R | plantilla sintética/fixture/efímera | S |
| `SELF_SERVICE_SESSION_TTL_MINUTES` | autoservicio | 1..120, D 30 | default | N |
| `SELF_SERVICE_OTP_TTL_MINUTES` | OTP | 1..30, D 10 | default | N |
| `SELF_SERVICE_OTP_MAX_ATTEMPTS` | OTP | 3..10, D 5 | default | N |
| `SELF_SERVICE_OTP_COOLDOWN_SECONDS` | OTP | 30..600, D 60 | default | N |
| `EXTERNAL_CORE_PROVIDER` | registry externo | enum `not_configured`/`hybrid`/`http`, D `not_configured` | fail-closed | N |
| `EXTERNAL_CORE_BASE_URL` | proveedor externo | URL cuando provider=http, C | vacío | N |
| `EXTERNAL_CORE_CLIENT_ID`, `EXTERNAL_CORE_CLIENT_SECRET`, `EXTERNAL_CORE_WEBHOOK_SECRET` | proveedor externo | no vacío cuando provider=http, C | vacío/no configurado | S |
| `EXTERNAL_CORE_TIMEOUT_MS` | proveedor externo | 500..30000, D 5000 | default | N |
| `SELF_SERVICE_MESSAGE_PROVIDER` | OTP delivery | solo `not_configured`, D | fail-closed | N |
| `BOLD_MODE` | pagos | mock/sandbox/production, D mock | mock | N |
| `BOLD_BASE_URL` | pagos | URL, D oficial | oficial/mock/mock | N |
| `BOLD_IDENTITY_KEY`, `BOLD_SECRET_KEY`, `BOLD_WEBHOOK_SECRET` | pagos | string; obligatorios por gate productivo | vacío | S |
| `PRODUCTION_PAYMENTS_ENABLED` | pagos | boolean string, D false | false | N |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | correo | strings; conjunto condicional | vacío/no-op | S |
| `SMTP_PORT` | correo | entero positivo opcional | vacío | N |
| `SMTP_SECURE`, `SMTP_FROM` | correo | boolean/string, D false/vacío | default | N |
| `CORPORATE_EMAIL` | correo institucional | email, D | `info@asodef.com.co` | N |
| `CORS_ORIGIN` | HTTP | lista/origen, D | localhost de cada runtime | N |
| `TRUST_PROXY` | HTTP | string boolean, D false | false | N |
| `LOG_LEVEL` | logging | enum, D info | info | N |
| `COOKIE_ACCESS_TOKEN_NAME`, `COOKIE_REFRESH_TOKEN_NAME`, `COOKIE_DOMAIN` | auth cookie | string, D | nombres ASODEF/sin domain | N |
| `ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM` | hash | enteros positivos, D 19456/2/1 | default | N |
| `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_DURATION_MINUTES` | auth | enteros acotados, D 5/15 | default | N |
| `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | auth | enteros acotados, D 10/60 | default | N |
| `PASSWORD_RESET_TOKEN_SECRET` | password reset | min 16, R | plantilla/fixture/efímera | S |
| `PASSWORD_RESET_TOKEN_TTL` | password reset | duración, D 1h | default | N |
| `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_LENGTH`, `PASSWORD_HISTORY_LIMIT` | password policy | positivos, D 12/128/5 | default | N |
| `FORGOT_PASSWORD_RATE_LIMIT_IP_MAX`, `FORGOT_PASSWORD_RATE_LIMIT_IP_WINDOW_SECONDS` | recovery | positivos, D 5/900 | default | N |
| `FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_MAX`, `FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_WINDOW_SECONDS` | recovery | positivos, D 3/900 | default | N |
| `RESET_PASSWORD_RATE_LIMIT_MAX`, `RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS` | recovery | positivos, D 10/900 | default | N |
| `CHANGE_PASSWORD_RATE_LIMIT_MAX`, `CHANGE_PASSWORD_RATE_LIMIT_WINDOW_SECONDS` | auth | positivos, D 5/900 | default | N |
| `LEADS_RATE_LIMIT_IP_MAX`, `LEADS_RATE_LIMIT_IP_WINDOW_SECONDS` | leads | positivos, D 5/3600 | default | N |
| `DATA_SUBJECT_REQUESTS_RATE_LIMIT_IP_MAX`, `DATA_SUBJECT_REQUESTS_RATE_LIMIT_IP_WINDOW_SECONDS` | DSR | positivos, D 5/3600 | default | N |
| `PQR_CASES_RATE_LIMIT_IP_MAX`, `PQR_CASES_RATE_LIMIT_IP_WINDOW_SECONDS` | PQR | positivos, D 5/3600 | default | N |
| `PAYMENT_ORDER_TTL_MINUTES` | órdenes | positivo, D 30 | default | N |
| `RECEIPTS_STORAGE_DIR`, `CONTRACTS_STORAGE_DIR`, `REFUNDS_STORAGE_DIR`, `REPORTS_STORAGE_DIR` | archivos privados | path, D bajo `storage/` | temporal/local | N |
| `CONTRACT_DOWNLOAD_TOKEN_SECRET` | contratos | min 16, R | plantilla/fixture/efímera | S |
| `CONTRACT_DOWNLOAD_URL_TTL_MINUTES` | contratos | positivo, D 15 | default | N |
| `VITE_API_URL`, `VITE_APP_URL` | build web | URL pública del runtime | localhost/localhost/4173+3100 | N |
| `PLAYWRIGHT_BASE_URL` | E2E | URL del preview | 5180 o 4173 | N |
| `COMPOSE_PROJECT_NAME`, `CI_POSTGRES_DB`, `CI_POSTGRES_USER`, `CI_POSTGRES_PASSWORD`, `CI_POSTGRES_PORT`, `CI_REDIS_PORT`, `CI_API_PORT`, `CI_WEB_PORT` | orquestación CI | identidad/puertos loopback aislados y distintos; password R | generado | password S; resto N |

Ningún secreto usa prefijo `VITE_`; por tanto no se incorpora un secreto al
bundle del navegador. `.env.example` contiene únicamente plantillas de
desarrollo y todos los `.env` reales están ignorados.

## Seguridad y dependencias

- Escaneo determinista del árbol actual y los 171 commits: cero llaves
  privadas y cero credenciales reales de alta confianza. Los candidatos
  restantes son plantillas, fixtures sintéticos o valores efímeros de CI.
- `gitleaks`, `trufflehog` y `detect-secrets` no estaban instalados; no se
  afirma haberlos ejecutado.
- `.claude/`, `docs/source/`, `.env*` reales, `node_modules`, outputs,
  reportes, logs y storage permanecen ignorados.
- El pack Git es 2.69 MiB y el archivo rastreado mayor es menor a 300 KiB.
- Audit final: 0 críticos y 0 altos. Permanecen avisos moderados que exigen
  migraciones mayores (Nest/React Router) o código no alcanzado por ASODEF
  (`FileTypeValidator`, SSR hydration); se registran como P3 y no se fuerzan
  upgrades amplios dentro de una recuperación de CI.

## Centro Legal protegido

Baseline concatenado de los ocho archivos protegidos:
`ec8fd836cd092570cf2708afbab6d92f7298677f575f4b304fa6f5e9a7f5d547`.
Baseline de base de datos: 21 documentos actuales, 21 publicados, versión 2;
digest `1655c18339f6e6a432b59ded4ad404a4`. La verificación final vuelve a calcular
ambos valores y recorre las 21 rutas. Esta fase no modifica ninguno de esos
ocho archivos ni el catálogo, seed, versiones o relaciones de consentimiento.

## Evidencia de cierre

Los tres loops globales se completaron:

1. Dos ejecuciones consecutivas de `pnpm ci:verify` en el checkout limpio
   `/tmp/asodef-final-clean3.qrkMMs/repo`: 34 migraciones desde cero, seed x3
   estable, 92 suites/803 pruebas API, 82/445 web, 8/46 UI, 1/5 payments,
   lint, TypeScript y build aprobados; Chromium 39/39 en cada ejecución.
2. `docker compose build --no-cache api web` produjo las imágenes
   `asodef-api` (`23659f9e…`) y `asodef-web` (`3d2a3a10…`). API/web fueron
   recreados conservando los volúmenes locales y quedaron healthy antes y
   después de restart; health API `ok` y frontend HTTP 200.
3. GitHub Actions run `31143329626`, job `92757607903`, SHA de implementación
   `9f4d2b5e005cb6d280956e4dc5d66751422be4ea`, concluyó `success` en 8m58s.
   Todos los gates materiales —incluidos seed limpio, source gates, runtime
   compilado y E2E— finalizaron correctamente.

Los runs `31142704730` y `31142917842` se mantuvieron como evidencia de dos
discrepancias adicionales encontradas por el runner: dependencia oculta de
`@asodef/config` durante seed y diferencia ICU de medianoche. Ambas fueron
corregidas en vez de reintentar u omitir gates.

El build web final contiene main `246.69 kB` (`68.0 kB` gzip), routing
`209.04 kB` (`68.31 kB` gzip), motion `103.87 kB` (`34.76 kB` gzip), forms
`82.39 kB` (`22.68 kB` gzip) y CSS `63.73 kB` (`12.09 kB` gzip). Solo queda
el warning P4 del chunk vacío `vendor-react`; no afecta runtime ni carga.

El Centro Legal conserva la huella concatenada
`ec8fd836cd092570cf2708afbab6d92f7298677f575f4b304fa6f5e9a7f5d547`;
21/21 documentos vigentes siguen publicados y sus 21 API/URLs públicas
respondieron 200. No hubo cambio en archivos protegidos, cuerpos, slugs,
versiones, `currentVersionId` ni relaciones de consentimiento.

Riesgos residuales: avisos moderados P3 no alcanzables o que requieren una
migración mayor separada (Nest, React Router y herramientas de desarrollo),
y aviso de GitHub sobre el runtime interno Node 20 de acciones v4. No quedan
hallazgos P0, P1 o P2 abiertos.
