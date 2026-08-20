# Web build used by local verification and immutable releases. The static
# bundle is served by the repository-owned Nginx configuration.
FROM node:20.19-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY . .
RUN test ! -e /app/.env && test ! -e /app/apps/web/.env.local
# Vite bakes VITE_* vars into the bundle at build time, not runtime -
# must be present before `pnpm --filter web build` runs, never after.
ARG VITE_API_URL
ARG VITE_APP_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_URL=${VITE_APP_URL}
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asodef/config build
RUN pnpm --filter @asodef/ui build
RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runner
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
