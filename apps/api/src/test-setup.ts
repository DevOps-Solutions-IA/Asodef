// Jest setupFiles entry: fills in a fully valid local-dev environment for
// any spec that instantiates PrismaClient or boots the real NestJS app
// (e.g. via NestFactory.create(AppModule) or Nest's TestingModule), so
// `pnpm test` works out of the box against the local docker-compose
// stack without extra setup. Tests that deliberately want to exercise a
// *missing* variable must explicitly `delete process.env.X` themselves
// (and restore it afterwards) - see bootstrap.integration.spec.ts.
process.env.DATABASE_URL ??= "postgresql://asodef:asodef_dev_password@localhost:5433/asodef?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test_jwt_secret_at_least_16_chars";
process.env.JWT_REFRESH_SECRET ??= "test_refresh_secret_at_least_16_chars";
process.env.ENCRYPTION_KEY ??= "test_encryption_key_needs_32_characters_min";
process.env.PASSWORD_RESET_TOKEN_SECRET ??= "test_reset_token_secret_at_least_16_chars";
process.env.CONTRACT_DOWNLOAD_TOKEN_SECRET ??= "test_contract_download_secret_at_least_16_chars";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.NODE_ENV ??= "test";
