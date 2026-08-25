# ASODEF Platform

Plataforma institucional de ASODEF S.A.S. para experiencia pública, beneficios, pagos con Bold, gestión de empresas y CRM, contratos, comunicaciones, PQR, solicitudes de titulares, consentimientos, documentos legales, reportes y portales autenticados.

## Arquitectura

- `apps/web`: SPA React, Vite, TanStack Query y componentes compartidos.
- `apps/api`: API NestJS con Prisma, PostgreSQL, Redis, RBAC y auditoría.
- `packages/ui`: sistema de componentes y tokens ASODEF.
- `packages/config`: configuración corporativa y esquemas compartidos.
- `packages/payments`: contrato de integración de pagos.
- `e2e`: pruebas Playwright contra el runtime real.

## Requisitos locales

- Node.js 20 o superior.
- pnpm 10.16.0 mediante Corepack.
- Docker Engine con Docker Compose.

## Configuración segura

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm prepare:generated
cp .env.example .env
```

La generación explícita es obligatoria en un checkout limpio: el schema
Prisma vive en `apps/api/prisma/schema.prisma` y no se debe depender del
cliente stub que puede dejar el postinstall ejecutado desde la raíz.

Los valores de `.env.example` son plantillas o valores exclusivos de desarrollo. No se deben reutilizar en producción. Los archivos `.env*`, salvo las plantillas `.env.example`, están excluidos de Git.

## Runtime local con Docker

```bash
docker compose up -d --build
```

Servicios predeterminados:

- Frontend: <http://localhost:8080>
- API: <http://localhost:3200>
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`

Comprueba la API en `http://localhost:3200/api/v1/health`.

### Local Preview para revisión funcional

Para revisar el producto integrado sobre el último `origin/main` certificado,
usa un único comando:

```bash
scripts/local-preview-start.sh
```

El comando valida o crea
`${XDG_RUNTIME_DIR:-/tmp}/asodef-local-preview-${UID}/runtime.env`, selecciona
puertos locales aislados, construye Web con el destino API correcto y levanta
PostgreSQL, Redis, API y Web reales. También aplica exactamente 51 migraciones,
comprueba cero drift, ejecuta tres veces el seed idempotente y prepara datos
sintéticos para la revisión administrativa.

Los servicios se publican exclusivamente sobre la dirección de red
`127.0.0.1`, mientras que las URLs canónicas consumidas por el navegador usan
`localhost`. `runtime.env` conserva ambas URLs como fuente única para el build,
la API, CORS y el harness de navegador; el comando de inicio las imprime sin
exponer credenciales.

El archivo `runtime.env` debe ser un archivo regular (no symlink), pertenecer al
usuario actual y tener modo `0600`. Puede habilitar el runtime de IA con
`AI_RUNTIME_ENABLED` y la configuración `OPENROUTER_*`; sus valores nunca se
imprimen ni se incluyen en las imágenes. SMTP, Meta, WhatsApp, Firebird y pagos
productivos permanecen deshabilitados en Local Preview.

Para detener exclusivamente este stack y eliminar sus volúmenes locales:

```bash
scripts/local-preview-stop.sh
```

`stop` es idempotente y conserva `runtime.env`, incluidas las credenciales
locales, para próximas revisiones. Ninguno de estos comandos toca producción.

## Desarrollo y calidad

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

El contrato canónico que reproduce GitHub Actions localmente es:

```bash
pnpm ci:verify
```

Usa PostgreSQL y Redis efímeros con nombre y puertos aislados, aplica las
migraciones desde cero, ejecuta el seed tres veces, reconstruye sin reutilizar
la caché del desarrollador y prueba el API compilado y el preview construido
en Chromium. Requiere Docker, pero no toca el proyecto Compose ni los
volúmenes de desarrollo.

Comandos de base de datos:

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Las migraciones y seeds están diseñados para el entorno local configurado. No ejecutes operaciones de base de datos contra producción sin un procedimiento y autorización independientes.

## Seguridad y contenido privado

- No se almacenan credenciales reales, llaves privadas ni archivos `.env` en el repositorio.
- Los documentos fuente privados de `docs/source/` permanecen exclusivamente locales y están ignorados.
- El estado local de agentes en `.claude/`, los resultados Playwright, logs, caches y datos de volúmenes no se publican.
- La autenticación, RBAC, consentimiento versionado y auditoría son controles del producto; no deben omitirse en integraciones nuevas.

La documentación técnica y los reportes de verificación se encuentran en [`docs/`](docs/).
