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

## 2. GPG trust boundary

The database host is an encryption-only boundary. Its dedicated GPG home must
contain the approved public key and **must not** contain private key material.
The validator checks the entire VPS GPG home and rejects a secret key for any
identity, not only the approved recipient.
The private key stays on the separately controlled custody host. Approval is
based on the full 40-hex fingerprint after an operator verifies the key owner,
expiry and custody procedure; an email-like UID alone is not approval.

On the custody host, export only the approved public key:

```sh
ops/admin-core/export-gpg-public-recipient.sh \
  --fingerprint <approved-40-hex-fingerprint> \
  --gpg-home <custody-gpg-home> \
  --output <transfer-dir>/asodef-backup-recipient.asc
```

Transfer the `.asc`, `.sha256` and `.metadata.json` files using the approved
binary-safe channel. On the VPS, import into a dedicated mode-0700 GPG home:

```sh
ops/admin-core/import-gpg-public-recipient.sh \
  --key-file <transfer-dir>/asodef-backup-recipient.asc \
  --checksum <transfer-dir>/asodef-backup-recipient.asc.sha256 \
  --fingerprint <approved-40-hex-fingerprint> \
  --gpg-home <vps-public-only-gpg-home>
```

The import fails if the checksum/fingerprint differs, the key is expired or
cannot encrypt, the file contains private material, or the target GPG home
contains the matching private key.

## 3. Encrypted backup on the VPS

The command streams `pg_dump` directly to GPG, keeps no plaintext dump and
emits an encrypted archive, SHA-256 file and sanitized metadata JSON. The VPS
can validate the ciphertext packet structure, but cannot and must not claim
decryptability without the custody private key.

```sh
ops/admin-core/backup-postgres-encrypted.sh \
  --container <public-postgres-container> --database <database> --user <user> \
  --recipient <approved-gpg-fingerprint> --gpg-home <vps-public-only-gpg-home> \
  --output-dir <protected-backup-dir> \
  --release-sha <exact-release-sha>
```

Expected VPS evidence is `ciphertextStructure=PASS` and
`decryptability=PENDING_CUSTODY_VERIFICATION`. Transfer only the encrypted
archive, checksum and metadata to custody. Never transfer a private key to the
VPS.

## 4. Custody verification, isolated restore and migrations

On the custody host, first prove checksum, recipient fingerprint,
decryptability and PostgreSQL custom-archive structure without writing a
plaintext dump:

```sh
ops/admin-core/verify-encrypted-backup-custody.sh \
  --archive <backup.dump.gpg> --checksum <backup.dump.gpg.sha256> \
  --metadata <backup.dump.gpg.metadata.json> \
  --fingerprint <approved-40-hex-fingerprint> \
  --gpg-home <custody-gpg-home> --database <source-database> \
  --release-sha <exact-release-sha>
```

This creates fresh PostgreSQL 16 and Redis containers on a temporary internal
Docker network, verifies the checksum, decrypts only into the restore pipe,
and applies migrations from the exact immutable API image. It requires exactly
40 applied migrations and removes every container/network on exit. It never
points Prisma at production and does not require Node or pnpm on the host.

```sh
ops/admin-core/rehearse-postgres-restore.sh \
  --archive <backup.dump.gpg> --checksum <backup.dump.gpg.sha256> \
  --metadata <backup.dump.gpg.metadata.json> \
  --recipient <approved-40-hex-fingerprint> \
  --gpg-home <custody-gpg-home> \
  --database <source-database> --release-sha <exact-release-sha> \
  --api-image asodef-public-platform-api:<exact-release-sha> \
  --api-image-id sha256:<exact-64-hex-image-id>
```

The same script starts the exact API image against the isolated database and
an isolated Redis, with synthetic ephemeral secrets, Master disabled and SMTP
disabled, then requires `/api/v1/health/ready` to pass. It also fails if the
single-admin invariant is not satisfied. Never reuse production SMTP in a
restore rehearsal because the restored outbox may contain deliverable jobs.

The rehearsal must run on a custody-controlled host that has the private key,
Docker and the exact immutable API image. It must not run on the production
VPS. No plaintext backup is written to disk.
The strict metadata parser rejects malformed JSON, duplicate/unknown fields,
or any mismatch in database identity, archive size, checksum, recipient,
encryption state or release SHA. It also binds the selected encryption subkey
to the ciphertext packet and the matching custody secret subkey. The rehearsal
accepts only the API tag `asodef-public-platform-api:<release-sha>` matching
that metadata and requires Docker to resolve it to the separately recorded
exact Image ID. If the image provides `org.opencontainers.image.revision`,
that label must equal the release SHA; absence is reported rather than
presented as a pass.

## 5. Residual privileged identity gate

See `residual-privilege-operator-gate.md`. The currently deployed release has
an authenticated role-revocation API/UI, but its historical audit write is
best-effort and lacks the new structured request context. The new release has
the required transactional audit, but correctly refuses to start while the
residual privileged identity exists. Do not weaken that startup invariant or
use direct SQL. A human release decision is required before the one-time
cleanup.

## 6. Rollback

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

## 7. Rotation

Generate the successor key only on the custody host, approve its full
fingerprint/owner/expiry, export/import the public part as above, and create a
test backup that passes custody verification. Keep the prior custody key until
every retained archive covered by it has aged out or has been re-encrypted on
custody. Remove the old public key from the VPS only after that evidence. Never
rotate by copying private material to production.
