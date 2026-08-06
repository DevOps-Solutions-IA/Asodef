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
cp .env.example .env
```

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

## Desarrollo y calidad

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

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
