-- Governed ASODEF/Koral Knowledge V1. Additive only: no existing data or
-- business table is rewritten. Lifecycle belongs to versioned content.
CREATE TYPE "knowledge_lifecycle_status" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED');
CREATE TYPE "knowledge_source_type" AS ENUM ('MANUAL_AUTHORING', 'FILE_UPLOAD', 'OFFICIAL_WEB_IMPORT');
CREATE TYPE "knowledge_domain" AS ENUM (
  'ASODEF_INSTITUCIONAL', 'SERVICIOS_Y_PROTECCION', 'AFILIACIONES',
  'PLANES_Y_COBERTURAS', 'BENEFICIARIOS', 'REQUISITOS',
  'BENEFICIOS_Y_CONVENIOS', 'AUXILIOS_Y_PROTECCIONES',
  'SOLICITUD_DE_SERVICIO', 'PAGOS_ORIENTACION', 'PQR',
  'ACTUALIZACION_DE_DATOS', 'CONTACTO_Y_CANALES', 'PREGUNTAS_FRECUENTES'
);
CREATE TYPE "knowledge_audience" AS ENUM ('PUBLIC', 'AUTHENTICATED_AFFILIATE', 'INTERNAL', 'ADMIN_ONLY');
CREATE TYPE "knowledge_data_classification" AS ENUM ('PUBLIC', 'INTERNAL', 'PERSONAL', 'SENSITIVE', 'HIGHLY_SENSITIVE');

CREATE TABLE "knowledge_items" (
  "id" UUID NOT NULL,
  "tenant_key" TEXT NOT NULL,
  "stable_key" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_versions" (
  "id" UUID NOT NULL,
  "knowledge_item_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "domain" "knowledge_domain" NOT NULL,
  "audience" "knowledge_audience" NOT NULL,
  "classification" "knowledge_data_classification" NOT NULL,
  "language" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "knowledge_lifecycle_status" NOT NULL DEFAULT 'DRAFT',
  "effective_from" TIMESTAMPTZ(3),
  "effective_until" TIMESTAMPTZ(3),
  "requires_revalidation_at" TIMESTAMPTZ(3),
  "change_reason" TEXT NOT NULL,
  "created_by_id" UUID NOT NULL,
  "reviewed_by_id" UUID,
  "approved_by_id" UUID,
  "published_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "reviewed_at" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "retired_at" TIMESTAMPTZ(3),
  CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_versions_spanish_only_check" CHECK ("language" = 'es'),
  CONSTRAINT "knowledge_versions_effective_window_check" CHECK ("effective_until" IS NULL OR "effective_from" IS NULL OR "effective_until" > "effective_from")
);

CREATE TABLE "knowledge_sources" (
  "id" UUID NOT NULL,
  "knowledge_version_id" UUID NOT NULL,
  "source_type" "knowledge_source_type" NOT NULL,
  "source_reference" TEXT NOT NULL,
  "source_owner" TEXT NOT NULL,
  "source_checksum" TEXT NOT NULL,
  "original_file_name" TEXT,
  "mime_type" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_sources_checksum_check" CHECK ("source_checksum" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "knowledge_chunks" (
  "id" UUID NOT NULL,
  "knowledge_version_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "checksum_sha256" TEXT NOT NULL,
  "token_estimate" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_chunks_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "knowledge_chunks_token_estimate_check" CHECK ("token_estimate" > 0),
  CONSTRAINT "knowledge_chunks_checksum_check" CHECK ("checksum_sha256" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "knowledge_publication_snapshots" (
  "id" UUID NOT NULL,
  "knowledge_version_id" UUID NOT NULL,
  "knowledge_item_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "domain" "knowledge_domain" NOT NULL,
  "audience" "knowledge_audience" NOT NULL,
  "classification" "knowledge_data_classification" NOT NULL,
  "language" TEXT NOT NULL,
  "source_reference" TEXT NOT NULL,
  "source_checksum" TEXT NOT NULL,
  "chunk_set_checksum" TEXT NOT NULL,
  "published_by_id" UUID NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL,
  "effective_from" TIMESTAMPTZ(3),
  "effective_until" TIMESTAMPTZ(3),
  CONSTRAINT "knowledge_publication_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_snapshots_spanish_only_check" CHECK ("language" = 'es'),
  CONSTRAINT "knowledge_snapshots_source_checksum_check" CHECK ("source_checksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "knowledge_snapshots_chunk_checksum_check" CHECK ("chunk_set_checksum" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "knowledge_audit_events" (
  "id" UUID NOT NULL,
  "knowledge_version_id" UUID NOT NULL,
  "knowledge_item_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "tenant_key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previous_status" "knowledge_lifecycle_status",
  "next_status" "knowledge_lifecycle_status",
  "result" "audit_event_result" NOT NULL,
  "correlation_id" TEXT,
  "request_id" TEXT,
  "change_reason" TEXT,
  "sanitized_metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_audit_events_tenant_check" CHECK ("tenant_key" = 'ASODEF'),
  CONSTRAINT "knowledge_audit_events_metadata_check" CHECK (jsonb_typeof("sanitized_metadata") = 'object')
);

CREATE TABLE "knowledge_retrieval_audits" (
  "id" UUID NOT NULL,
  "effective_actor_id" TEXT NOT NULL,
  "principal_type" TEXT NOT NULL,
  "tenant_key" TEXT NOT NULL,
  "audience" "knowledge_audience" NOT NULL,
  "query_digest" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "reason_code" TEXT,
  "correlation_id" TEXT NOT NULL,
  "citation_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_retrieval_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_retrieval_audits_digest_check" CHECK ("query_digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "knowledge_retrieval_audits_citation_count_check" CHECK ("citation_count" >= 0)
);

CREATE UNIQUE INDEX "knowledge_items_tenant_key_stable_key_key" ON "knowledge_items"("tenant_key", "stable_key");
CREATE INDEX "knowledge_items_tenant_key_idx" ON "knowledge_items"("tenant_key");
CREATE UNIQUE INDEX "knowledge_versions_knowledge_item_id_version_key" ON "knowledge_versions"("knowledge_item_id", "version");
CREATE INDEX "knowledge_versions_status_domain_audience_language_idx" ON "knowledge_versions"("status", "domain", "audience", "language");
CREATE INDEX "knowledge_versions_effective_from_effective_until_idx" ON "knowledge_versions"("effective_from", "effective_until");
CREATE UNIQUE INDEX "knowledge_sources_knowledge_version_id_key" ON "knowledge_sources"("knowledge_version_id");
CREATE INDEX "knowledge_sources_source_type_source_checksum_idx" ON "knowledge_sources"("source_type", "source_checksum");
CREATE UNIQUE INDEX "knowledge_chunks_knowledge_version_id_ordinal_key" ON "knowledge_chunks"("knowledge_version_id", "ordinal");
CREATE INDEX "knowledge_chunks_knowledge_version_id_ordinal_idx" ON "knowledge_chunks"("knowledge_version_id", "ordinal");
CREATE UNIQUE INDEX "knowledge_publication_snapshots_knowledge_version_id_key" ON "knowledge_publication_snapshots"("knowledge_version_id");
CREATE INDEX "knowledge_snapshots_filter_published_idx" ON "knowledge_publication_snapshots"("domain", "audience", "language", "published_at");
CREATE INDEX "knowledge_snapshots_item_published_at_idx" ON "knowledge_publication_snapshots"("knowledge_item_id", "published_at");
CREATE INDEX "knowledge_audit_events_knowledge_item_id_created_at_idx" ON "knowledge_audit_events"("knowledge_item_id", "created_at");
CREATE INDEX "knowledge_audit_events_knowledge_version_id_created_at_idx" ON "knowledge_audit_events"("knowledge_version_id", "created_at");
CREATE INDEX "knowledge_audit_events_actor_user_id_created_at_idx" ON "knowledge_audit_events"("actor_user_id", "created_at");
CREATE INDEX "knowledge_audit_events_correlation_id_idx" ON "knowledge_audit_events"("correlation_id");
CREATE INDEX "knowledge_retrieval_audits_correlation_id_idx" ON "knowledge_retrieval_audits"("correlation_id");
CREATE INDEX "knowledge_retrieval_audits_tenant_key_audience_created_at_idx" ON "knowledge_retrieval_audits"("tenant_key", "audience", "created_at");

ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_knowledge_item_id_fkey" FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_publication_snapshots" ADD CONSTRAINT "knowledge_publication_snapshots_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "knowledge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_publication_snapshots" ADD CONSTRAINT "knowledge_publication_snapshots_knowledge_item_id_fkey" FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_publication_snapshots" ADD CONSTRAINT "knowledge_publication_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_publication_snapshots" ADD CONSTRAINT "knowledge_publication_snapshots_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "knowledge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_knowledge_item_id_fkey" FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_audit_events" ADD CONSTRAINT "knowledge_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
