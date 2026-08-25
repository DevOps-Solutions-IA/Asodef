#!/usr/bin/env sh
set -eu

expected_migrations=51
migrations_dir=/app/apps/api/prisma/migrations

if [ "${LOCAL_PREVIEW:-}" != "true" ]; then
  echo "Local preview initialization requires LOCAL_PREVIEW=true." >&2
  exit 1
fi

migration_total="$(find "$migrations_dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [ "$migration_total" != "$expected_migrations" ]; then
  echo "Local preview expected $expected_migrations migrations; found $migration_total." >&2
  exit 1
fi

pnpm prisma:generate
pnpm prisma:deploy
pnpm exec prisma migrate status --schema prisma/schema.prisma
pnpm exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code

seed_run=1
while [ "$seed_run" -le 3 ]; do
  pnpm prisma:seed
  seed_run=$((seed_run + 1))
done

pnpm exec ts-node /app/apps/api/src/database/local-preview-prepare.ts
printf 'Local preview database ready: %s migrations; zero drift; seeds 3/3.\n' "$migration_total"
