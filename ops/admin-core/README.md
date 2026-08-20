# Admin Core production operations

These artifacts make the Phase 1 release reproducible without storing runtime
values. They operate only on the public ASODEF API/Web and PostgreSQL backup;
they do not contain or manage Firebird, R3, Bold, payments or the protected
WhatsApp project.

## 1. Runtime preflight

Use the production env file in its protected host location. The validator
parses it as data (it never `source`s it), prints key names/status only and
fails on missing, empty or malformed Admin/SMTP configuration.

```sh
ops/admin-core/verify-runtime-env.sh --env-file /protected/path/.env.production --expected-mfa false
```

Add `docker-compose.admin-core.yml` after the existing public-platform Compose
files. It injects only named variables and contains no value. Validate the
resolved model with the existing sanitized validator; never print unfiltered
`docker compose config` output.

## 2. Encrypted backup

The recipient must already be trusted and have its private key available for
the decryptability check. The command streams `pg_dump` directly to GPG, keeps
no plaintext dump and emits an encrypted archive, SHA-256 file and sanitized
metadata JSON.

```sh
ops/admin-core/backup-postgres-encrypted.sh \
  --container <public-postgres-container> --database <database> --user <user> \
  --recipient <approved-gpg-fingerprint> --output-dir <protected-backup-dir> \
  --release-sha <exact-release-sha>
```

## 3. Isolated restore and migrations

This creates fresh PostgreSQL 16 and Redis containers on a temporary internal
Docker network, verifies the checksum, decrypts only into the restore pipe,
and applies migrations from the exact immutable API image. It requires exactly
40 applied migrations and removes every container/network on exit. It never
points Prisma at production and does not require Node or pnpm on the host.

```sh
ops/admin-core/rehearse-postgres-restore.sh \
  --archive <backup.dump.gpg> --checksum <backup.dump.gpg.sha256> \
  --api-image <exact-release-api-image>
```

The same script starts the exact API image against the isolated database and
an isolated Redis, with synthetic ephemeral secrets, Master disabled and SMTP
disabled, then requires `/api/v1/health/ready` to pass. It also fails if the
single-admin invariant is not satisfied. Never reuse production SMTP in a
restore rehearsal because the restored outbox may contain deliverable jobs.

## 4. Rollback

First invoke without `--apply`; it validates the exact public project, Compose
files and both prior images. With `--apply`, only services `api` and `web` are
recreated. Additive migrations 35–40 remain in place; do not drop their data.

```sh
ops/admin-core/rollback-public-admin-core.sh \
  --project asodef-public-platform-production \
  --compose <production-compose> --compose <admin-core-overlay> \
  --api-image <previous-api-image> --web-image <previous-web-image>
```

After readiness is proven, repeat with `--apply`, then verify API/Web health,
release identifiers, restart counts, PostgreSQL, Redis and the unchanged
protected-stack container IDs. Do not use `docker compose down` or global
Docker cleanup.
