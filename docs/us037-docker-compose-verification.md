# US-037 — Full local Docker Compose verification

Documented manual verification pass, performed 2026-08-04 against a locally built
`docker compose` stack (web, api, postgres, redis). Not the production stack —
production Docker Compose, Dockerfiles, and Nginx config for asodef.com.co are
US-039's own job. This file records the evidence for US-037's own acceptance
criteria; it is not a runbook.

## Bringing the stack up

```bash
docker compose build api web
JWT_SECRET=<dev-only, generated fresh> \
JWT_REFRESH_SECRET=<dev-only, generated fresh> \
ENCRYPTION_KEY=<dev-only, generated fresh> \
PASSWORD_RESET_TOKEN_SECRET=<dev-only, generated fresh> \
docker compose up -d
```

`api`/`web` publish to `127.0.0.1:3200`/`127.0.0.1:8080` — deliberately different
from any ad-hoc local dev servers that might already be running on 3100/5180, so
bringing this stack up never conflicts with them. `postgres`/`redis` keep their
existing 5433/6379 mappings; if those containers are already running (this
project's own persistent local dev dependencies), `docker compose up -d` leaves
them exactly as they are and only creates/recreates `api`/`web`.

## `docker compose ps` — all 4 services healthy simultaneously

```
NAME                IMAGE                COMMAND                  SERVICE    CREATED          STATUS                    PORTS
asodef-api-1        asodef-api           "docker-entrypoint.s…"   api        22 seconds ago   Up 19 seconds (healthy)   127.0.0.1:3200->3000/tcp
asodef-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   42 hours ago     Up 40 hours (healthy)     127.0.0.1:5433->5432/tcp
asodef-redis-1      redis:7-alpine       "docker-entrypoint.s…"   redis      42 hours ago     Up 40 hours (healthy)     127.0.0.1:6379->6379/tcp
asodef-web-1        asodef-web           "/docker-entrypoint.…"   web        4 minutes ago    Up 4 minutes (healthy)    127.0.0.1:8080->80/tcp
```

## Manual verification pass (AC, verbatim)

- **Homepage loads**: `http://localhost:8080/` — 200, real hero copy rendered
  ("Soluciones que fortalecen el bienestar y desarrollo de las familias"), zero
  console errors, verified in real Chromium.
- **`/pagos` lookup works end-to-end through mock-Bold approval**: searched the
  seeded demo customer (document `1000000001`) → real obligation returned →
  "Pagar" created a real `PaymentOrder` → order summary screen → "Continuar al
  pago" → real `POST /payments/bold/create` (BOLD_MODE=mock) → resolved to
  "Aprobado". Test order deleted afterward.
- **`/api/v1/health/ready` returns 200**: `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`.
- **Login/logout works**: logged in with a disposable local test account, landed
  on `/admin`, zero tokens in `localStorage`/`sessionStorage`, empty
  `document.cookie` (HttpOnly confirmed); logout returned to `/iniciar-sesion`.

## Negative case (AC, verbatim): misconfigured `REDIS_URL`

```bash
JWT_SECRET=... JWT_REFRESH_SECRET=... ENCRYPTION_KEY=... PASSWORD_RESET_TOKEN_SECRET=... \
REDIS_URL="redis://nonexistent-host:6379" \
docker compose up -d api
```

Result: the `api` container's own healthcheck (`GET /api/v1/health/ready`, which
itself checks the Redis connection) failed every interval and Docker correctly
flipped its status to `unhealthy` — confirmed via `docker inspect asodef-api-1
--format '{{.State.Health.Status}}'` → `unhealthy`, and via `docker compose ps`
reflecting it as unhealthy rather than silently appearing fine. Container logs
showed the real failure reason (`Failed to start ASODEF API: Connection is
closed.`) rather than a misleadingly "fine" state. Restoring the correct
`REDIS_URL` and recreating the container brought it back to `healthy`.

## Bug found and fixed during this verification

1. **Prisma + bare `node:20-alpine`**: the API image originally crash-looped on
   startup (`Error loading shared library libssl.so.1.1: No such file or
   directory`) — Alpine 3.19+ ships OpenSSL 3.x with no `libssl.so.1.1`, and
   without the `openssl` package present, Prisma's own runtime OpenSSL-version
   probe fails and silently defaults to the wrong engine binary. Fixed by adding
   `RUN apk add --no-cache openssl` to the base stage of `apps/api/Dockerfile`.
2. **Bare `nginx:alpine` serving a client-side-routed SPA**: `/pagos` (and every
   other React Router route) returned nginx's own default 404 page, since
   nginx's default config only serves literal files/directories and `/pagos` has
   no matching file on disk. Fixed with a minimal `apps/web/nginx.conf`
   (`try_files $uri $uri/ /index.html;`).

## After verification

The `api`/`web` containers were stopped (not removed) once verification
completed — they served their purpose; running three full environments
side-by-side on a shared machine indefinitely is unnecessary resource
duplication. `postgres`/`redis` (this project's own persistent local dev
dependencies) were left exactly as they were throughout - never stopped,
restarted, or reconfigured.
