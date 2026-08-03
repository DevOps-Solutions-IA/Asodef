// Jest setupFiles entry: ensures DATABASE_URL falls back to the local
// docker-compose Postgres for any spec that instantiates PrismaClient
// directly (e.g. via NestJS DI), mirroring test-db-client.ts's fallback
// for specs that build their own PrismaClient explicitly.
process.env.DATABASE_URL ??= "postgresql://asodef:asodef_dev_password@localhost:5433/asodef?schema=public";
