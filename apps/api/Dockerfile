# US-037: local Docker Compose verification only - this is NOT the
# production image (that is US-039's own job, with its own image-size
# and security hardening). Copies the whole monorepo into the build
# stage rather than selectively copying package.json files, trading
# some layer-cache efficiency for a Dockerfile that's simple and
# unambiguously correct for a pnpm workspace with several internal
# packages (@asodef/config, @asodef/payments).
FROM node:20-alpine AS base
# Alpine 3.19+ ships OpenSSL 3.x with no libssl.so.1.1 - without the
# openssl package present, Prisma's own runtime OpenSSL-version probe
# fails and silently defaults to the wrong (openssl-1.1.x) engine
# binary, which then refuses to load at startup (a well-known Prisma +
# bare node:*-alpine gotcha, confirmed empirically in this project:
# `Error loading shared library libssl.so.1.1: No such file or
# directory`). schema.prisma's own binaryTargets already generates the
# correct linux-musl-openssl-3.0.x engine; this is what lets Prisma
# actually detect and pick it.
RUN apk add --no-cache openssl
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asodef/config build
RUN pnpm --filter @asodef/payments build
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./

WORKDIR /app/apps/api
EXPOSE 3000

# schema.prisma's own generator already targets linux-musl-openssl-3.0.x
# (Alpine-compatible) alongside "native" - this image works without
# needing a glibc base.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/v1/health/ready',(res)=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
