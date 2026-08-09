-- Additive identity bridge for trusted external self-service subjects.
-- Raw subject references are deliberately not stored in PostgreSQL.
CREATE TABLE "affiliate_external_identities" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject_ref_hash" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_external_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "affiliate_external_identities_issuer_check"
      CHECK (char_length("issuer") BETWEEN 1 AND 200 AND btrim("issuer") <> ''),
    CONSTRAINT "affiliate_external_identities_subject_ref_hash_check"
      CHECK ("subject_ref_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "affiliate_external_identities_verified_order_check"
      CHECK ("last_verified_at" >= "verified_at")
);

CREATE UNIQUE INDEX "affiliate_external_identities_issuer_subject_ref_hash_key"
  ON "affiliate_external_identities"("issuer", "subject_ref_hash");

CREATE UNIQUE INDEX "affiliate_external_identities_issuer_affiliate_id_key"
  ON "affiliate_external_identities"("issuer", "affiliate_id");

CREATE INDEX "affiliate_external_identities_affiliate_id_idx"
  ON "affiliate_external_identities"("affiliate_id");

ALTER TABLE "affiliate_external_identities"
  ADD CONSTRAINT "affiliate_external_identities_affiliate_id_fkey"
  FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
