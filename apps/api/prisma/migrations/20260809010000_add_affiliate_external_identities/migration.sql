-- Additive lifecycle-aware identity bridge for trusted external subjects.
-- Raw subject references are deliberately never stored in PostgreSQL.
CREATE TYPE "affiliate_external_identity_status" AS ENUM ('ACTIVE', 'REPLACED', 'REVOKED');

CREATE TABLE "affiliate_external_identities" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "status" "affiliate_external_identity_status" NOT NULL DEFAULT 'ACTIVE',
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(3),
    "replaced_by_identity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_external_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "affiliate_external_identities_issuer_check"
      CHECK (char_length("issuer") BETWEEN 1 AND 200 AND btrim("issuer") <> ''),
    CONSTRAINT "affiliate_external_identities_verified_order_check"
      CHECK ("last_verified_at" >= "verified_at"),
    CONSTRAINT "affiliate_external_identities_lifecycle_check" CHECK (
      ("status" = 'ACTIVE' AND "deactivated_at" IS NULL AND "replaced_by_identity_id" IS NULL)
      OR ("status" = 'REPLACED' AND "deactivated_at" IS NOT NULL AND "replaced_by_identity_id" IS NOT NULL)
      OR ("status" = 'REVOKED' AND "deactivated_at" IS NOT NULL AND "replaced_by_identity_id" IS NULL)
    ),
    CONSTRAINT "affiliate_external_identities_no_self_replacement_check"
      CHECK ("replaced_by_identity_id" IS NULL OR "replaced_by_identity_id" <> "id")
);

CREATE TABLE "affiliate_external_identity_fingerprints" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "subject_ref_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_external_identity_fingerprints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "affiliate_external_identity_fingerprints_key_id_check"
      CHECK ("key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
    CONSTRAINT "affiliate_external_identity_fingerprints_subject_ref_hash_check"
      CHECK ("subject_ref_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "affiliate_external_identity_fingerprints_retirement_check"
      CHECK ("retired_at" IS NULL OR "retired_at" >= "created_at")
);

CREATE UNIQUE INDEX "affiliate_external_identities_id_issuer_key"
  ON "affiliate_external_identities"("id", "issuer");

-- The replacement scope is part of the referenced key so PostgreSQL, rather
-- than only application code, guarantees that a successor belongs to the
-- same affiliate and trusted issuer.
CREATE UNIQUE INDEX "affiliate_external_identities_id_affiliate_id_issuer_key"
  ON "affiliate_external_identities"("id", "affiliate_id", "issuer");

CREATE UNIQUE INDEX "affiliate_external_identities_replacement_chain_key"
  ON "affiliate_external_identities"("replaced_by_identity_id", "affiliate_id", "issuer");

-- Historical identities remain present, while exactly one ACTIVE identity is
-- allowed for an affiliate inside a given trusted issuer.
CREATE UNIQUE INDEX "affiliate_external_identities_active_affiliate_issuer_key"
  ON "affiliate_external_identities"("affiliate_id", "issuer")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "affiliate_external_identities_affiliate_id_issuer_status_idx"
  ON "affiliate_external_identities"("affiliate_id", "issuer", "status");

CREATE INDEX "affiliate_external_identities_issuer_status_idx"
  ON "affiliate_external_identities"("issuer", "status");

CREATE UNIQUE INDEX "affiliate_external_identity_fingerprints_issuer_key_id_subject_ref_hash_key"
  ON "affiliate_external_identity_fingerprints"("issuer", "key_id", "subject_ref_hash");

CREATE UNIQUE INDEX "affiliate_external_identity_fingerprints_identity_id_key_id_key"
  ON "affiliate_external_identity_fingerprints"("identity_id", "key_id");

CREATE INDEX "affiliate_external_identity_fingerprints_identity_id_idx"
  ON "affiliate_external_identity_fingerprints"("identity_id");

CREATE INDEX "affiliate_external_identity_fingerprints_key_id_retired_at_idx"
  ON "affiliate_external_identity_fingerprints"("key_id", "retired_at");

ALTER TABLE "affiliate_external_identities"
  ADD CONSTRAINT "affiliate_external_identities_affiliate_id_fkey"
  FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "affiliate_external_identities"
  ADD CONSTRAINT "affiliate_external_identities_replacement_scope_fkey"
  FOREIGN KEY ("replaced_by_identity_id", "affiliate_id", "issuer")
  REFERENCES "affiliate_external_identities"("id", "affiliate_id", "issuer")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "affiliate_external_identity_fingerprints"
  ADD CONSTRAINT "affiliate_external_identity_fingerprints_identity_id_issuer_fkey"
  FOREIGN KEY ("identity_id", "issuer") REFERENCES "affiliate_external_identities"("id", "issuer")
  ON DELETE RESTRICT ON UPDATE CASCADE;
