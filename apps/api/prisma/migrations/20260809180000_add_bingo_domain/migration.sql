-- CreateEnum
CREATE TYPE "bingo_event_status" AS ENUM ('DRAFT', 'CONFIGURED', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "bingo_event_visibility" AS ENUM ('PUBLIC', 'AUTHENTICATED_AFFILIATES', 'AUTHORIZED_PARTICIPANTS');

-- CreateEnum
CREATE TYPE "bingo_eligibility_policy" AS ENUM ('AFFILIATES', 'AFFILIATES_AND_BENEFICIARIES', 'PARTNER_COMPANY', 'AUTHORIZED_GUESTS', 'COMBINED', 'CUSTOM_APPROVED');

-- CreateEnum
CREATE TYPE "bingo_eligibility_rule_kind" AS ENUM ('ACTIVE_AFFILIATE', 'BENEFICIARY', 'PARTNER_COMPANY_MEMBER', 'AUTHORIZED_GUEST', 'CUSTOM_APPROVED');

-- CreateEnum
CREATE TYPE "bingo_participant_kind" AS ENUM ('AFFILIATE', 'BENEFICIARY', 'PARTNER_COMPANY_MEMBER', 'AUTHORIZED_GUEST');

-- CreateEnum
CREATE TYPE "bingo_participant_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "bingo_eligibility_approval_status" AS ENUM ('APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "bingo_validation_policy" AS ENUM ('SIMPLE', 'DUAL_CONTROL');

-- CreateEnum
CREATE TYPE "bingo_tie_policy" AS ENUM ('SPLIT_PRIZE', 'FULL_PRIZE_EACH', 'TIE_BREAK', 'PRECONFIGURED_SPECIAL_RULE');

-- CreateEnum
CREATE TYPE "bingo_fairness_mode" AS ENUM ('CRYPTO_RNG', 'CRYPTO_RNG_COMMIT_REVEAL');

-- CreateEnum
CREATE TYPE "bingo_public_winner_visibility" AS ENUM ('CARD_ONLY', 'PARTIAL_NAME_AND_CARD');

-- CreateEnum
CREATE TYPE "bingo_round_status" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "bingo_execution_status" AS ENUM ('PLANNED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "bingo_pattern_kind" AS ENUM ('LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_CARD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "bingo_prize_kind" AS ENUM ('MONETARY', 'IN_KIND');

-- CreateEnum
CREATE TYPE "bingo_assignment_status" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "bingo_candidate_status" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "bingo_winner_status" AS ENUM ('PENDING_VALIDATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "bingo_command_status" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL');

-- CreateEnum
CREATE TYPE "bingo_outbox_status" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "bingo_import_format" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "bingo_import_status" AS ENUM ('UPLOADED', 'VALIDATING', 'STAGED', 'READY_FOR_APPROVAL', 'APPROVED', 'APPLYING', 'COMPLETED', 'REJECTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "bingo_import_row_status" AS ENUM ('VALID', 'INVALID', 'UNRESOLVED', 'APPLIED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "bingo_import_chunk_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "bingo_audit_result" AS ENUM ('SUCCEEDED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "bingo_retention_category" AS ENUM ('TEMPORARY_FILE', 'ORIGINAL_IMPORT', 'IMPORT_STAGING', 'PARTICIPATION', 'CARD', 'ASSIGNMENT', 'ROUND_EXECUTION', 'DRAW', 'CANDIDATE', 'WINNER', 'AUDIT', 'CRYPTOGRAPHIC_EVIDENCE');

-- CreateTable
CREATE TABLE "bingo_events" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "bingo_event_status" NOT NULL DEFAULT 'DRAFT',
    "visibility" "bingo_event_visibility" NOT NULL DEFAULT 'AUTHORIZED_PARTICIPANTS',
    "eligibility_policy" "bingo_eligibility_policy" NOT NULL,
    "max_cards_per_participant" INTEGER NOT NULL DEFAULT 1,
    "public_winner_visibility" "bingo_public_winner_visibility" NOT NULL DEFAULT 'CARD_ONLY',
    "default_validation_policy" "bingo_validation_policy" NOT NULL DEFAULT 'SIMPLE',
    "fairness_mode" "bingo_fairness_mode" NOT NULL DEFAULT 'CRYPTO_RNG',
    "configuration_version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "scheduled_start_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "configuration_locked_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_eligibility_rules" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "bingo_eligibility_rule_kind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parameters" JSONB,
    "locked_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_eligibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_authorized_external_subjects" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "bingo_participant_kind" NOT NULL,
    "issuer" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "subject_ref_fingerprint" TEXT NOT NULL,
    "source_reference_hash" TEXT,
    "owner_affiliate_id" UUID,
    "company_id" UUID,
    "linked_customer_id" UUID,
    "resolved_by_user_id" UUID,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "last_verified_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_authorized_external_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_participants" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "bingo_participant_kind" NOT NULL,
    "status" "bingo_participant_status" NOT NULL DEFAULT 'PENDING',
    "affiliate_id" UUID,
    "external_subject_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_eligibility_approvals" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "eligibility_rule_id" UUID NOT NULL,
    "status" "bingo_eligibility_approval_status" NOT NULL,
    "source" TEXT NOT NULL,
    "source_reference_hash" TEXT,
    "actor_user_id" UUID NOT NULL,
    "reason" TEXT,
    "context" JSONB,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "bingo_eligibility_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_rounds" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "bingo_round_status" NOT NULL DEFAULT 'DRAFT',
    "validation_policy" "bingo_validation_policy" NOT NULL,
    "tie_policy" "bingo_tie_policy" NOT NULL,
    "tie_policy_configuration" JSONB,
    "configuration_version" INTEGER NOT NULL DEFAULT 1,
    "configuration_locked_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_prizes" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "bingo_prize_kind" NOT NULL,
    "amount_minor" INTEGER,
    "currency" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_patterns" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "bingo_pattern_kind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "required_match_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_pattern_masks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "pattern_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "position_mask" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_pattern_masks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_round_patterns" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "pattern_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_round_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_round_executions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "previous_execution_id" UUID,
    "status" "bingo_execution_status" NOT NULL DEFAULT 'PLANNED',
    "state_version" BIGINT NOT NULL DEFAULT 0,
    "validation_policy_snapshot" "bingo_validation_policy" NOT NULL,
    "tie_policy_snapshot" "bingo_tie_policy" NOT NULL,
    "fairness_mode_snapshot" "bingo_fairness_mode" NOT NULL,
    "configuration_version" INTEGER NOT NULL,
    "operator_user_id" UUID,
    "supervisor_user_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "paused_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_round_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_fairness_commitments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "hash_algorithm" TEXT NOT NULL,
    "rng_algorithm" TEXT NOT NULL,
    "protocol_version" TEXT NOT NULL,
    "commitment_hash" TEXT NOT NULL,
    "seed_ciphertext" TEXT NOT NULL,
    "custody_key_id" TEXT NOT NULL,
    "committed_by_user_id" UUID NOT NULL,
    "committed_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "revealed_seed" TEXT,
    "revealed_by_user_id" UUID,
    "revealed_at" TIMESTAMPTZ(3),
    "reveal_evidence_hash" TEXT,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_fairness_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_cards" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "display_number" TEXT NOT NULL,
    "numbers" SMALLINT[],
    "layout_hash" TEXT NOT NULL,
    "generation_version" INTEGER NOT NULL DEFAULT 1,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_card_pattern_masks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "pattern_id" UUID NOT NULL,
    "pattern_mask_id" UUID NOT NULL,
    "required_numbers" BIT(75) NOT NULL,
    "derived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derivation_hash" TEXT NOT NULL,

    CONSTRAINT "bingo_card_pattern_masks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_card_assignments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "round_context_id" UUID,
    "status" "bingo_assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(3),
    "superseded_by_assignment_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_card_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_execution_actors" (
    "execution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_action_at" TIMESTAMPTZ(3) NOT NULL,
    "last_action_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_execution_actors_pkey" PRIMARY KEY ("execution_id","user_id")
);

-- CreateTable
CREATE TABLE "bingo_draws" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "ball_number" INTEGER NOT NULL,
    "drawn_by_user_id" UUID NOT NULL,
    "drawn_at" TIMESTAMPTZ(3) NOT NULL,
    "request_id" TEXT NOT NULL,
    "idempotency_record_id" UUID NOT NULL,
    "previous_evidence_hash" TEXT,
    "evidence_hash" TEXT NOT NULL,
    "rng_evidence" JSONB NOT NULL,
    "state_version" BIGINT NOT NULL,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_win_groups" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "prize_id" UUID NOT NULL,
    "pattern_id" UUID NOT NULL,
    "round_pattern_id" UUID NOT NULL,
    "decisive_draw_id" UUID NOT NULL,
    "tie_policy_snapshot" "bingo_tie_policy" NOT NULL,
    "candidate_count" INTEGER NOT NULL,
    "detected_at" TIMESTAMPTZ(3) NOT NULL,
    "evidence_hash" TEXT NOT NULL,

    CONSTRAINT "bingo_win_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_winner_candidates" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "win_group_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "matched_numbers" BIT(75) NOT NULL,
    "status" "bingo_candidate_status" NOT NULL DEFAULT 'PENDING',
    "decisive_ball" INTEGER NOT NULL,
    "detected_at" TIMESTAMPTZ(3) NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "rejection_reason" TEXT,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),

    CONSTRAINT "bingo_winner_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_winners" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "win_group_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "prize_id" UUID NOT NULL,
    "status" "bingo_winner_status" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "validation_policy_snapshot" "bingo_validation_policy" NOT NULL,
    "validated_by_user_id" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "rejected_by_user_id" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "tie_resolution" JSONB,
    "evidence_hash" TEXT NOT NULL,
    "public_display_snapshot" JSONB NOT NULL,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_tie_breaks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "origin_win_group_id" UUID NOT NULL,
    "origin_execution_id" UUID NOT NULL,
    "target_execution_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_tie_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_command_idempotency" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "execution_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "bingo_command_status" NOT NULL DEFAULT 'PROCESSING',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "bingo_command_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_outbox_events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "execution_id" UUID,
    "sequence" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "aggregate_version" BIGINT NOT NULL,
    "public_payload" JSONB NOT NULL,
    "status" "bingo_outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "bingo_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_import_batches" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "format" "bingo_import_format" NOT NULL,
    "status" "bingo_import_status" NOT NULL DEFAULT 'UPLOADED',
    "sha256" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_reference" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sheet_count" INTEGER,
    "row_count" INTEGER,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "unresolved_count" INTEGER NOT NULL DEFAULT 0,
    "validator_version" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_import_rows" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "sheet_name" TEXT NOT NULL DEFAULT '',
    "status" "bingo_import_row_status" NOT NULL,
    "error_codes" TEXT[],
    "normalized_payload_encrypted" TEXT,
    "payload_schema_version" TEXT NOT NULL,
    "external_subject_id" UUID,
    "participant_id" UUID,
    "applied_at" TIMESTAMPTZ(3),
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_import_application_chunks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "first_row" INTEGER NOT NULL,
    "last_row" INTEGER NOT NULL,
    "status" "bingo_import_chunk_status" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_import_application_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_audit_events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_id" UUID,
    "execution_id" UUID,
    "actor_user_id" UUID,
    "actor_permission" TEXT,
    "action" TEXT NOT NULL,
    "result" "bingo_audit_result" NOT NULL,
    "reason" TEXT,
    "previous_state" JSONB,
    "new_state" JSONB,
    "request_id" TEXT NOT NULL,
    "idempotency_key_hash" TEXT,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "metadata" JSONB,
    "retention_until" TIMESTAMPTZ(3),
    "legal_hold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bingo_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bingo_retention_policies" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category" "bingo_retention_category" NOT NULL,
    "configured_retention_days" INTEGER NOT NULL,
    "corporate_minimum_days" INTEGER NOT NULL,
    "effective_retention_days" INTEGER NOT NULL,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "configured_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bingo_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bingo_events_slug_key" ON "bingo_events"("slug");

-- CreateIndex
CREATE INDEX "bingo_events_status_scheduled_start_at_idx" ON "bingo_events"("status", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "bingo_eligibility_rules_event_id_enabled_kind_idx" ON "bingo_eligibility_rules"("event_id", "enabled", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_eligibility_rules_id_event_id_key" ON "bingo_eligibility_rules"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_eligibility_rules_event_id_kind_version_key" ON "bingo_eligibility_rules"("event_id", "kind", "version");

-- CreateIndex
CREATE INDEX "bingo_authorized_external_subjects_owner_affiliate_id_idx" ON "bingo_authorized_external_subjects"("owner_affiliate_id");

-- CreateIndex
CREATE INDEX "bingo_authorized_external_subjects_company_id_idx" ON "bingo_authorized_external_subjects"("company_id");

-- CreateIndex
CREATE INDEX "bingo_authorized_external_subjects_linked_customer_id_idx" ON "bingo_authorized_external_subjects"("linked_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_authorized_external_subjects_id_event_id_key" ON "bingo_authorized_external_subjects"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_authorized_external_subjects_id_event_id_kind_key" ON "bingo_authorized_external_subjects"("id", "event_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_authorized_external_subjects_event_id_issuer_key_id_s_key" ON "bingo_authorized_external_subjects"("event_id", "issuer", "key_id", "subject_ref_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_participants_external_subject_id_key" ON "bingo_participants"("external_subject_id");

-- CreateIndex
CREATE INDEX "bingo_participants_event_id_status_id_idx" ON "bingo_participants"("event_id", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_participants_id_event_id_key" ON "bingo_participants"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_participants_external_subject_id_event_id_kind_key" ON "bingo_participants"("external_subject_id", "event_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_participants_event_id_affiliate_id_key" ON "bingo_participants"("event_id", "affiliate_id");

-- CreateIndex
CREATE INDEX "bingo_participants_affiliate_id_idx" ON "bingo_participants"("affiliate_id");

-- CreateIndex
CREATE INDEX "bingo_eligibility_approvals_event_id_participant_id_status_idx" ON "bingo_eligibility_approvals"("event_id", "participant_id", "status");

-- CreateIndex
CREATE INDEX "bingo_eligibility_approvals_actor_user_id_decided_at_idx" ON "bingo_eligibility_approvals"("actor_user_id", "decided_at");

-- CreateIndex
CREATE INDEX "bingo_eligibility_approvals_rule_event_idx" ON "bingo_eligibility_approvals"("eligibility_rule_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_rounds_event_id_status_sequence_idx" ON "bingo_rounds"("event_id", "status", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_rounds_id_event_id_key" ON "bingo_rounds"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_rounds_event_id_sequence_key" ON "bingo_rounds"("event_id", "sequence");

-- CreateIndex
CREATE INDEX "bingo_prizes_event_id_idx" ON "bingo_prizes"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_prizes_id_event_id_key" ON "bingo_prizes"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_prizes_id_round_id_event_id_key" ON "bingo_prizes"("id", "round_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_prizes_round_id_sequence_key" ON "bingo_prizes"("round_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_patterns_id_event_id_key" ON "bingo_patterns"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_patterns_event_id_code_version_key" ON "bingo_patterns"("event_id", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_pattern_masks_id_event_id_key" ON "bingo_pattern_masks"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_pattern_masks_id_pattern_id_event_id_key" ON "bingo_pattern_masks"("id", "pattern_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_pattern_masks_pattern_id_sequence_key" ON "bingo_pattern_masks"("pattern_id", "sequence");

-- CreateIndex
CREATE INDEX "bingo_round_patterns_pattern_id_event_id_idx" ON "bingo_round_patterns"("pattern_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_patterns_round_id_pattern_id_key" ON "bingo_round_patterns"("round_id", "pattern_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_patterns_id_round_id_event_id_pattern_id_key" ON "bingo_round_patterns"("id", "round_id", "event_id", "pattern_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_patterns_round_id_sequence_key" ON "bingo_round_patterns"("round_id", "sequence");

-- CreateIndex
CREATE INDEX "bingo_round_executions_event_id_status_idx" ON "bingo_round_executions"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_executions_id_event_id_key" ON "bingo_round_executions"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_executions_id_round_id_event_id_key" ON "bingo_round_executions"("id", "round_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_executions_round_id_revision_key" ON "bingo_round_executions"("round_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_round_executions_previous_execution_id_round_id_event_key" ON "bingo_round_executions"("previous_execution_id", "round_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_fairness_commitments_execution_id_key" ON "bingo_fairness_commitments"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_fairness_commitments_execution_id_event_id_key" ON "bingo_fairness_commitments"("execution_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_fairness_commitments_event_id_commitment_hash_key" ON "bingo_fairness_commitments"("event_id", "commitment_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_cards_id_event_id_key" ON "bingo_cards"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_cards_event_id_display_number_key" ON "bingo_cards"("event_id", "display_number");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_cards_event_id_layout_hash_key" ON "bingo_cards"("event_id", "layout_hash");

-- CreateIndex
CREATE INDEX "bingo_card_pattern_masks_event_id_pattern_id_card_id_idx" ON "bingo_card_pattern_masks"("event_id", "pattern_id", "card_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_card_pattern_masks_card_id_pattern_mask_id_key" ON "bingo_card_pattern_masks"("card_id", "pattern_mask_id");

-- CreateIndex
CREATE INDEX "bingo_card_pattern_masks_pattern_scope_idx" ON "bingo_card_pattern_masks"("pattern_mask_id", "pattern_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_card_assignments_event_id_participant_id_status_idx" ON "bingo_card_assignments"("event_id", "participant_id", "status");

-- CreateIndex
CREATE INDEX "bingo_card_assignments_round_context_event_idx" ON "bingo_card_assignments"("round_context_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_card_assignments_actor_user_id_assigned_at_idx" ON "bingo_card_assignments"("actor_user_id", "assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_card_assignments_id_event_id_card_id_key" ON "bingo_card_assignments"("id", "event_id", "card_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_card_assignments_id_event_id_card_id_participant_id_key" ON "bingo_card_assignments"("id", "event_id", "card_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_card_assignments_superseded_by_assignment_id_event_id_key" ON "bingo_card_assignments"("superseded_by_assignment_id", "event_id", "card_id");

-- CreateIndex
CREATE INDEX "bingo_execution_actors_user_id_last_action_at_idx" ON "bingo_execution_actors"("user_id", "last_action_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_draws_idempotency_record_id_key" ON "bingo_draws"("idempotency_record_id");

-- CreateIndex
CREATE INDEX "bingo_draws_event_id_drawn_at_idx" ON "bingo_draws"("event_id", "drawn_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_draws_id_execution_id_event_id_key" ON "bingo_draws"("id", "execution_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_draws_execution_id_sequence_key" ON "bingo_draws"("execution_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_draws_execution_id_ball_number_key" ON "bingo_draws"("execution_id", "ball_number");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_draws_execution_id_evidence_hash_key" ON "bingo_draws"("execution_id", "evidence_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_win_groups_id_execution_id_event_id_key" ON "bingo_win_groups"("id", "execution_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_win_groups_id_event_id_key" ON "bingo_win_groups"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_win_groups_id_prize_round_execution_event_key" ON "bingo_win_groups"("id", "prize_id", "round_id", "execution_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_win_groups_execution_id_prize_id_pattern_id_decisive__key" ON "bingo_win_groups"("execution_id", "prize_id", "pattern_id", "decisive_draw_id");

-- CreateIndex
CREATE INDEX "bingo_win_groups_round_pattern_scope_idx" ON "bingo_win_groups"("round_pattern_id", "round_id", "event_id", "pattern_id");

-- CreateIndex
CREATE INDEX "bingo_winner_candidates_execution_id_status_idx" ON "bingo_winner_candidates"("execution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_winner_candidates_id_event_id_key" ON "bingo_winner_candidates"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_winner_candidates_id_group_execution_event_key" ON "bingo_winner_candidates"("id", "win_group_id", "execution_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_winner_candidates_win_group_id_card_id_key" ON "bingo_winner_candidates"("win_group_id", "card_id");

-- CreateIndex
CREATE INDEX "bingo_winner_candidates_assignment_scope_idx" ON "bingo_winner_candidates"("assignment_id", "event_id", "card_id", "participant_id");

-- CreateIndex
CREATE INDEX "bingo_winners_execution_id_status_idx" ON "bingo_winners"("execution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_winners_event_id_evidence_hash_key" ON "bingo_winners"("event_id", "evidence_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_winners_candidate_id_event_id_key" ON "bingo_winners"("candidate_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_winners_candidate_group_execution_event_key" ON "bingo_winners"("candidate_id", "win_group_id", "execution_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_winners_win_group_prize_scope_idx" ON "bingo_winners"("win_group_id", "prize_id", "round_id", "execution_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_tie_breaks_origin_win_group_id_key" ON "bingo_tie_breaks"("origin_win_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_tie_breaks_origin_group_execution_event_key" ON "bingo_tie_breaks"("origin_win_group_id", "origin_execution_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_tie_breaks_target_execution_id_event_id_idx" ON "bingo_tie_breaks"("target_execution_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_tie_breaks_created_by_user_id_idx" ON "bingo_tie_breaks"("created_by_user_id");

-- CreateIndex
CREATE INDEX "bingo_command_idempotency_event_id_status_created_at_idx" ON "bingo_command_idempotency"("event_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_command_idempotency_actor_user_id_scope_operation_key_key" ON "bingo_command_idempotency"("actor_user_id", "scope", "operation", "key_hash");

-- CreateIndex
CREATE INDEX "bingo_outbox_events_status_next_attempt_at_created_at_idx" ON "bingo_outbox_events"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_outbox_events_event_id_sequence_key" ON "bingo_outbox_events"("event_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_outbox_events_event_aggregate_version_type_key" ON "bingo_outbox_events"("event_id", "aggregate_type", "aggregate_id", "aggregate_version", "event_type");

-- CreateIndex
CREATE INDEX "bingo_import_batches_event_id_status_created_at_idx" ON "bingo_import_batches"("event_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_import_batches_id_event_id_key" ON "bingo_import_batches"("id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_import_batches_event_id_sha256_key" ON "bingo_import_batches"("event_id", "sha256");

-- CreateIndex
CREATE INDEX "bingo_import_rows_batch_id_status_row_number_idx" ON "bingo_import_rows"("batch_id", "status", "row_number");

-- CreateIndex
CREATE INDEX "bingo_import_rows_participant_id_idx" ON "bingo_import_rows"("participant_id");

-- CreateIndex
CREATE INDEX "bingo_import_rows_external_subject_event_idx" ON "bingo_import_rows"("external_subject_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_import_rows_batch_id_sheet_name_row_number_key" ON "bingo_import_rows"("batch_id", "sheet_name", "row_number");

-- CreateIndex
CREATE INDEX "bingo_import_application_chunks_status_created_at_idx" ON "bingo_import_application_chunks"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_import_application_chunks_batch_id_sequence_key" ON "bingo_import_application_chunks"("batch_id", "sequence");

-- CreateIndex
CREATE INDEX "bingo_audit_events_event_id_created_at_idx" ON "bingo_audit_events"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "bingo_audit_events_round_id_event_id_idx" ON "bingo_audit_events"("round_id", "event_id");

-- CreateIndex
CREATE INDEX "bingo_audit_events_execution_id_created_at_idx" ON "bingo_audit_events"("execution_id", "created_at");

-- CreateIndex
CREATE INDEX "bingo_audit_events_actor_user_id_created_at_idx" ON "bingo_audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "bingo_audit_events_action_created_at_idx" ON "bingo_audit_events"("action", "created_at");

-- CreateIndex
CREATE INDEX "bingo_retention_policies_category_legal_hold_idx" ON "bingo_retention_policies"("category", "legal_hold");

-- CreateIndex
CREATE UNIQUE INDEX "bingo_retention_policies_event_id_category_key" ON "bingo_retention_policies"("event_id", "category");

-- CreateIndex
CREATE INDEX "bingo_retention_policies_configured_by_user_id_idx" ON "bingo_retention_policies"("configured_by_user_id");

-- AddForeignKey
ALTER TABLE "bingo_events" ADD CONSTRAINT "bingo_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_events" ADD CONSTRAINT "bingo_events_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_eligibility_rules" ADD CONSTRAINT "bingo_eligibility_rules_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_eligibility_rules" ADD CONSTRAINT "bingo_eligibility_rules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_authorized_external_subjects_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_authorized_external_subjects_owner_affiliate_id_fkey" FOREIGN KEY ("owner_affiliate_id") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_authorized_external_subjects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_authorized_external_subjects_linked_customer_id_fkey" FOREIGN KEY ("linked_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_authorized_external_subjects_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_participants" ADD CONSTRAINT "bingo_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_participants" ADD CONSTRAINT "bingo_participants_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_participants" ADD CONSTRAINT "bingo_participants_external_subject_id_event_id_kind_fkey" FOREIGN KEY ("external_subject_id", "event_id", "kind") REFERENCES "bingo_authorized_external_subjects"("id", "event_id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_eligibility_approvals" ADD CONSTRAINT "bingo_eligibility_approvals_participant_id_event_id_fkey" FOREIGN KEY ("participant_id", "event_id") REFERENCES "bingo_participants"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_eligibility_approvals" ADD CONSTRAINT "bingo_eligibility_approvals_eligibility_rule_id_event_id_fkey" FOREIGN KEY ("eligibility_rule_id", "event_id") REFERENCES "bingo_eligibility_rules"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_eligibility_approvals" ADD CONSTRAINT "bingo_eligibility_approvals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_rounds" ADD CONSTRAINT "bingo_rounds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_rounds" ADD CONSTRAINT "bingo_rounds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_prizes" ADD CONSTRAINT "bingo_prizes_round_id_event_id_fkey" FOREIGN KEY ("round_id", "event_id") REFERENCES "bingo_rounds"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_patterns" ADD CONSTRAINT "bingo_patterns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_pattern_masks" ADD CONSTRAINT "bingo_pattern_masks_pattern_id_event_id_fkey" FOREIGN KEY ("pattern_id", "event_id") REFERENCES "bingo_patterns"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_patterns" ADD CONSTRAINT "bingo_round_patterns_round_id_event_id_fkey" FOREIGN KEY ("round_id", "event_id") REFERENCES "bingo_rounds"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_patterns" ADD CONSTRAINT "bingo_round_patterns_pattern_id_event_id_fkey" FOREIGN KEY ("pattern_id", "event_id") REFERENCES "bingo_patterns"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_round_id_event_id_fkey" FOREIGN KEY ("round_id", "event_id") REFERENCES "bingo_rounds"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_previous_execution_id_round_id_even_fkey" FOREIGN KEY ("previous_execution_id", "round_id", "event_id") REFERENCES "bingo_round_executions"("id", "round_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_fairness_commitments" ADD CONSTRAINT "bingo_fairness_commitments_execution_id_event_id_fkey" FOREIGN KEY ("execution_id", "event_id") REFERENCES "bingo_round_executions"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_fairness_commitments" ADD CONSTRAINT "bingo_fairness_commitments_committed_by_user_id_fkey" FOREIGN KEY ("committed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_fairness_commitments" ADD CONSTRAINT "bingo_fairness_commitments_revealed_by_user_id_fkey" FOREIGN KEY ("revealed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_pattern_masks" ADD CONSTRAINT "bingo_card_pattern_masks_card_id_event_id_fkey" FOREIGN KEY ("card_id", "event_id") REFERENCES "bingo_cards"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_pattern_masks" ADD CONSTRAINT "bingo_card_pattern_masks_pattern_id_event_id_fkey" FOREIGN KEY ("pattern_id", "event_id") REFERENCES "bingo_patterns"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_pattern_masks" ADD CONSTRAINT "bingo_card_pattern_masks_pattern_scope_fkey" FOREIGN KEY ("pattern_mask_id", "pattern_id", "event_id") REFERENCES "bingo_pattern_masks"("id", "pattern_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_card_id_event_id_fkey" FOREIGN KEY ("card_id", "event_id") REFERENCES "bingo_cards"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_participant_id_event_id_fkey" FOREIGN KEY ("participant_id", "event_id") REFERENCES "bingo_participants"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_round_context_id_event_id_fkey" FOREIGN KEY ("round_context_id", "event_id") REFERENCES "bingo_rounds"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_superseded_by_assignment_id_event_i_fkey" FOREIGN KEY ("superseded_by_assignment_id", "event_id", "card_id") REFERENCES "bingo_card_assignments"("id", "event_id", "card_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reassignment is a two-row state transition: the old row points to the new
-- row while the partial unique index permits only one ACTIVE assignment.  A
-- deferred FK lets the transaction deactivate the old row before inserting
-- its successor without ever weakening the final referential invariant.
ALTER TABLE "bingo_card_assignments"
  ALTER CONSTRAINT "bingo_card_assignments_superseded_by_assignment_id_event_i_fkey"
  DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "bingo_execution_actors" ADD CONSTRAINT "bingo_execution_actors_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "bingo_round_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_execution_actors" ADD CONSTRAINT "bingo_execution_actors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_draws" ADD CONSTRAINT "bingo_draws_execution_id_round_id_event_id_fkey" FOREIGN KEY ("execution_id", "round_id", "event_id") REFERENCES "bingo_round_executions"("id", "round_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_draws" ADD CONSTRAINT "bingo_draws_drawn_by_user_id_fkey" FOREIGN KEY ("drawn_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_draws" ADD CONSTRAINT "bingo_draws_idempotency_record_id_fkey" FOREIGN KEY ("idempotency_record_id") REFERENCES "bingo_command_idempotency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_execution_id_round_id_event_id_fkey" FOREIGN KEY ("execution_id", "round_id", "event_id") REFERENCES "bingo_round_executions"("id", "round_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_prize_id_round_id_event_id_fkey" FOREIGN KEY ("prize_id", "round_id", "event_id") REFERENCES "bingo_prizes"("id", "round_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_pattern_id_event_id_fkey" FOREIGN KEY ("pattern_id", "event_id") REFERENCES "bingo_patterns"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_round_pattern_scope_fkey" FOREIGN KEY ("round_pattern_id", "round_id", "event_id", "pattern_id") REFERENCES "bingo_round_patterns"("id", "round_id", "event_id", "pattern_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_decisive_draw_id_execution_id_event_id_fkey" FOREIGN KEY ("decisive_draw_id", "execution_id", "event_id") REFERENCES "bingo_draws"("id", "execution_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winner_candidates" ADD CONSTRAINT "bingo_winner_candidates_win_group_id_execution_id_event_id_fkey" FOREIGN KEY ("win_group_id", "execution_id", "event_id") REFERENCES "bingo_win_groups"("id", "execution_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winner_candidates" ADD CONSTRAINT "bingo_winner_candidates_card_id_event_id_fkey" FOREIGN KEY ("card_id", "event_id") REFERENCES "bingo_cards"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winner_candidates" ADD CONSTRAINT "bingo_winner_candidates_participant_id_event_id_fkey" FOREIGN KEY ("participant_id", "event_id") REFERENCES "bingo_participants"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winner_candidates" ADD CONSTRAINT "bingo_winner_candidates_assignment_scope_fkey" FOREIGN KEY ("assignment_id", "event_id", "card_id", "participant_id") REFERENCES "bingo_card_assignments"("id", "event_id", "card_id", "participant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winners" ADD CONSTRAINT "bingo_winners_candidate_scope_fkey" FOREIGN KEY ("candidate_id", "win_group_id", "execution_id", "event_id") REFERENCES "bingo_winner_candidates"("id", "win_group_id", "execution_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winners" ADD CONSTRAINT "bingo_winners_win_group_prize_scope_fkey" FOREIGN KEY ("win_group_id", "prize_id", "round_id", "execution_id", "event_id") REFERENCES "bingo_win_groups"("id", "prize_id", "round_id", "execution_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winners" ADD CONSTRAINT "bingo_winners_prize_id_round_id_event_id_fkey" FOREIGN KEY ("prize_id", "round_id", "event_id") REFERENCES "bingo_prizes"("id", "round_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winners" ADD CONSTRAINT "bingo_winners_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_winners" ADD CONSTRAINT "bingo_winners_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_tie_breaks" ADD CONSTRAINT "bingo_tie_breaks_origin_scope_fkey" FOREIGN KEY ("origin_win_group_id", "origin_execution_id", "event_id") REFERENCES "bingo_win_groups"("id", "execution_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_tie_breaks" ADD CONSTRAINT "bingo_tie_breaks_target_scope_fkey" FOREIGN KEY ("target_execution_id", "event_id") REFERENCES "bingo_round_executions"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_tie_breaks" ADD CONSTRAINT "bingo_tie_breaks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_command_idempotency" ADD CONSTRAINT "bingo_command_idempotency_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_command_idempotency" ADD CONSTRAINT "bingo_command_idempotency_execution_id_event_id_fkey" FOREIGN KEY ("execution_id", "event_id") REFERENCES "bingo_round_executions"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_command_idempotency" ADD CONSTRAINT "bingo_command_idempotency_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_outbox_events" ADD CONSTRAINT "bingo_outbox_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_outbox_events" ADD CONSTRAINT "bingo_outbox_events_execution_id_event_id_fkey" FOREIGN KEY ("execution_id", "event_id") REFERENCES "bingo_round_executions"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_batches" ADD CONSTRAINT "bingo_import_batches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_batches" ADD CONSTRAINT "bingo_import_batches_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_batches" ADD CONSTRAINT "bingo_import_batches_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_rows" ADD CONSTRAINT "bingo_import_rows_batch_id_event_id_fkey" FOREIGN KEY ("batch_id", "event_id") REFERENCES "bingo_import_batches"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_rows" ADD CONSTRAINT "bingo_import_rows_external_subject_id_event_id_fkey" FOREIGN KEY ("external_subject_id", "event_id") REFERENCES "bingo_authorized_external_subjects"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_rows" ADD CONSTRAINT "bingo_import_rows_participant_id_event_id_fkey" FOREIGN KEY ("participant_id", "event_id") REFERENCES "bingo_participants"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_import_application_chunks" ADD CONSTRAINT "bingo_import_application_chunks_batch_id_event_id_fkey" FOREIGN KEY ("batch_id", "event_id") REFERENCES "bingo_import_batches"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_audit_events" ADD CONSTRAINT "bingo_audit_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_audit_events" ADD CONSTRAINT "bingo_audit_events_round_id_event_id_fkey" FOREIGN KEY ("round_id", "event_id") REFERENCES "bingo_rounds"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_audit_events" ADD CONSTRAINT "bingo_audit_events_execution_id_event_id_fkey" FOREIGN KEY ("execution_id", "event_id") REFERENCES "bingo_round_executions"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_audit_events" ADD CONSTRAINT "bingo_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_retention_policies" ADD CONSTRAINT "bingo_retention_policies_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "bingo_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bingo_retention_policies" ADD CONSTRAINT "bingo_retention_policies_configured_by_user_id_fkey" FOREIGN KEY ("configured_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------------------------
-- Domain invariants Prisma cannot express.
-- -------------------------------------------------------------------------

-- Prisma list fields are non-null at the client boundary; make the same
-- invariant explicit in PostgreSQL because arrays otherwise default nullable.
ALTER TABLE "bingo_cards" ALTER COLUMN "numbers" SET NOT NULL;
ALTER TABLE "bingo_import_rows" ALTER COLUMN "error_codes" SET NOT NULL;

ALTER TABLE "bingo_events" ADD CONSTRAINT "bingo_events_slug_check"
  CHECK ("slug" = lower("slug") AND "slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
ALTER TABLE "bingo_events" ADD CONSTRAINT "bingo_events_configuration_check"
  CHECK ("max_cards_per_participant" > 0 AND "configuration_version" > 0);
ALTER TABLE "bingo_events" ADD CONSTRAINT "bingo_events_lifecycle_check" CHECK (
  ("status" IN ('DRAFT', 'CONFIGURED') AND "started_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "started_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'IN_PROGRESS' AND "published_at" IS NOT NULL AND "configuration_locked_at" IS NOT NULL AND "started_at" IS NOT NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" IN ('COMPLETED', 'ARCHIVED') AND "published_at" IS NOT NULL AND "configuration_locked_at" IS NOT NULL AND "started_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL)
);

ALTER TABLE "bingo_eligibility_rules" ADD CONSTRAINT "bingo_eligibility_rules_version_check"
  CHECK ("version" > 0);

ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_external_subjects_source_check" CHECK (
  char_length(btrim("issuer")) BETWEEN 1 AND 200
  AND "key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  AND "subject_ref_fingerprint" ~ '^[0-9a-f]{64}$'
  AND ("source_reference_hash" IS NULL OR "source_reference_hash" ~ '^[0-9a-f]{64}$')
  AND "last_verified_at" >= "verified_at"
  AND ("revoked_at" IS NULL OR "revoked_at" >= "verified_at")
);
ALTER TABLE "bingo_authorized_external_subjects" ADD CONSTRAINT "bingo_external_subjects_kind_check" CHECK (
  ("kind" = 'BENEFICIARY' AND "owner_affiliate_id" IS NOT NULL AND "company_id" IS NULL)
  OR ("kind" = 'PARTNER_COMPANY_MEMBER' AND "owner_affiliate_id" IS NULL AND "company_id" IS NOT NULL)
  OR ("kind" = 'AUTHORIZED_GUEST' AND "owner_affiliate_id" IS NULL)
);

ALTER TABLE "bingo_participants" ADD CONSTRAINT "bingo_participants_subject_check" CHECK (
  ("kind" = 'AFFILIATE' AND "affiliate_id" IS NOT NULL AND "external_subject_id" IS NULL)
  OR ("kind" <> 'AFFILIATE' AND "affiliate_id" IS NULL AND "external_subject_id" IS NOT NULL)
);
ALTER TABLE "bingo_participants" ADD CONSTRAINT "bingo_participants_lifecycle_check" CHECK (
  ("status" = 'PENDING' AND "approved_at" IS NULL AND "rejected_at" IS NULL AND "withdrawn_at" IS NULL)
  OR ("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "rejected_at" IS NULL AND "withdrawn_at" IS NULL)
  OR ("status" = 'REJECTED' AND "approved_at" IS NULL AND "rejected_at" IS NOT NULL AND "withdrawn_at" IS NULL AND "reason" IS NOT NULL)
  OR ("status" = 'WITHDRAWN' AND "withdrawn_at" IS NOT NULL AND "reason" IS NOT NULL)
);

ALTER TABLE "bingo_eligibility_approvals" ADD CONSTRAINT "bingo_eligibility_approvals_evidence_check" CHECK (
  char_length(btrim("source")) > 0
  AND ("source_reference_hash" IS NULL OR "source_reference_hash" ~ '^[0-9a-f]{64}$')
  AND (("status" = 'REVOKED' AND "revoked_at" IS NOT NULL AND "reason" IS NOT NULL)
    OR ("status" <> 'REVOKED' AND "revoked_at" IS NULL))
);
CREATE UNIQUE INDEX "bingo_eligibility_approvals_active_key"
  ON "bingo_eligibility_approvals"("participant_id", "eligibility_rule_id")
  WHERE "status" = 'APPROVED' AND "revoked_at" IS NULL;

ALTER TABLE "bingo_rounds" ADD CONSTRAINT "bingo_rounds_configuration_check" CHECK (
  "sequence" > 0 AND "configuration_version" > 0
  AND ("tie_policy" <> 'PRECONFIGURED_SPECIAL_RULE' OR "tie_policy_configuration" IS NOT NULL)
  AND ("status" = 'DRAFT' OR "configuration_locked_at" IS NOT NULL)
);

ALTER TABLE "bingo_prizes" ADD CONSTRAINT "bingo_prizes_value_check" CHECK (
  "sequence" > 0 AND "quantity" > 0
  AND (("kind" = 'MONETARY' AND "amount_minor" IS NOT NULL AND "amount_minor" >= 0 AND "currency" ~ '^[A-Z]{3}$')
    OR ("kind" = 'IN_KIND' AND "amount_minor" IS NULL AND "currency" IS NULL))
);

ALTER TABLE "bingo_patterns" ADD CONSTRAINT "bingo_patterns_match_count_check"
  CHECK ("version" > 0 AND "required_match_count" > 0);
ALTER TABLE "bingo_pattern_masks" ADD CONSTRAINT "bingo_pattern_masks_position_check"
  CHECK ("sequence" > 0 AND "position_mask" BETWEEN 1 AND 33554431);
ALTER TABLE "bingo_round_patterns" ADD CONSTRAINT "bingo_round_patterns_sequence_check"
  CHECK ("sequence" > 0);

ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_revision_check"
  CHECK ("revision" > 0 AND "state_version" >= 0 AND ("previous_execution_id" IS NULL OR "previous_execution_id" <> "id"));
ALTER TABLE "bingo_round_executions" ADD CONSTRAINT "bingo_round_executions_lifecycle_check" CHECK (
  ("status" = 'PLANNED' AND "started_at" IS NULL AND "paused_at" IS NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'RUNNING' AND "started_at" IS NOT NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'PAUSED' AND "started_at" IS NOT NULL AND "paused_at" IS NOT NULL AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'COMPLETED' AND "started_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL AND "completed_at" IS NULL)
);
CREATE UNIQUE INDEX "bingo_round_executions_one_active_key"
  ON "bingo_round_executions"("round_id") WHERE "status" IN ('RUNNING', 'PAUSED');

ALTER TABLE "bingo_fairness_commitments" ADD CONSTRAINT "bingo_fairness_commitments_crypto_check" CHECK (
  char_length(btrim("hash_algorithm")) > 0
  AND char_length(btrim("rng_algorithm")) > 0
  AND char_length(btrim("protocol_version")) > 0
  AND "commitment_hash" ~ '^[0-9a-f]{64}$'
  AND char_length(btrim("seed_ciphertext")) > 0
  AND "custody_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  AND ("published_at" IS NULL OR "published_at" >= "committed_at")
  AND (("revealed_seed" IS NULL AND "revealed_by_user_id" IS NULL AND "revealed_at" IS NULL AND "reveal_evidence_hash" IS NULL)
    OR ("revealed_seed" IS NOT NULL AND "revealed_by_user_id" IS NOT NULL AND "revealed_at" IS NOT NULL
      AND "revealed_at" >= "committed_at" AND "reveal_evidence_hash" ~ '^[0-9a-f]{64}$'))
);

CREATE FUNCTION "bingo_valid_card"("card" SMALLINT[]) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT array_ndims("card") = 1
    AND array_lower("card", 1) = 1
    AND cardinality("card") = 25
    AND "card"[13] = 0
    AND (SELECT count(*) = 25 FROM unnest("card") AS value)
    AND (SELECT count(DISTINCT value) = 25 FROM unnest("card") AS value)
    AND "card"[1] BETWEEN 1 AND 15 AND "card"[6] BETWEEN 1 AND 15 AND "card"[11] BETWEEN 1 AND 15 AND "card"[16] BETWEEN 1 AND 15 AND "card"[21] BETWEEN 1 AND 15
    AND "card"[2] BETWEEN 16 AND 30 AND "card"[7] BETWEEN 16 AND 30 AND "card"[12] BETWEEN 16 AND 30 AND "card"[17] BETWEEN 16 AND 30 AND "card"[22] BETWEEN 16 AND 30
    AND "card"[3] BETWEEN 31 AND 45 AND "card"[8] BETWEEN 31 AND 45 AND "card"[18] BETWEEN 31 AND 45 AND "card"[23] BETWEEN 31 AND 45
    AND "card"[4] BETWEEN 46 AND 60 AND "card"[9] BETWEEN 46 AND 60 AND "card"[14] BETWEEN 46 AND 60 AND "card"[19] BETWEEN 46 AND 60 AND "card"[24] BETWEEN 46 AND 60
    AND "card"[5] BETWEEN 61 AND 75 AND "card"[10] BETWEEN 61 AND 75 AND "card"[15] BETWEEN 61 AND 75 AND "card"[20] BETWEEN 61 AND 75 AND "card"[25] BETWEEN 61 AND 75;
$$;
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_layout_check" CHECK ("bingo_valid_card"("numbers"));
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_hash_check" CHECK (
  "layout_hash" ~ '^[0-9a-f]{64}$' AND "generation_version" > 0 AND char_length(btrim("display_number")) > 0
);
ALTER TABLE "bingo_card_pattern_masks" ADD CONSTRAINT "bingo_card_pattern_masks_hash_check"
  CHECK ("derivation_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_no_self_replacement_check"
  CHECK ("superseded_by_assignment_id" IS NULL OR "superseded_by_assignment_id" <> "id");
ALTER TABLE "bingo_card_assignments" ADD CONSTRAINT "bingo_card_assignments_lifecycle_check" CHECK (
  char_length(btrim("reason")) > 0 AND char_length(btrim("request_id")) > 0
  AND (("status" = 'ACTIVE' AND "deactivated_at" IS NULL AND "superseded_by_assignment_id" IS NULL)
    OR ("status" = 'SUPERSEDED' AND "deactivated_at" IS NOT NULL AND "superseded_by_assignment_id" IS NOT NULL)
    OR ("status" = 'REVOKED' AND "deactivated_at" IS NOT NULL AND "superseded_by_assignment_id" IS NULL))
);
CREATE UNIQUE INDEX "bingo_card_assignments_one_active_key"
  ON "bingo_card_assignments"("event_id", "card_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "bingo_execution_actors" ADD CONSTRAINT "bingo_execution_actors_time_check"
  CHECK ("last_action_at" >= "first_action_at");
ALTER TABLE "bingo_draws" ADD CONSTRAINT "bingo_draws_value_check" CHECK (
  "sequence" > 0 AND "ball_number" BETWEEN 1 AND 75 AND "state_version" > 0
  AND char_length(btrim("request_id")) > 0
  AND "evidence_hash" ~ '^[0-9a-f]{64}$'
  AND ("previous_evidence_hash" IS NULL OR "previous_evidence_hash" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "bingo_win_groups" ADD CONSTRAINT "bingo_win_groups_evidence_check"
  CHECK ("candidate_count" > 0 AND "evidence_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "bingo_winner_candidates" ADD CONSTRAINT "bingo_winner_candidates_evidence_check" CHECK (
  "decisive_ball" BETWEEN 1 AND 75 AND "evidence_hash" ~ '^[0-9a-f]{64}$'
  AND (("status" = 'REJECTED' AND "rejection_reason" IS NOT NULL) OR "status" <> 'REJECTED')
);
ALTER TABLE "bingo_winners" ADD CONSTRAINT "bingo_winners_lifecycle_check" CHECK (
  "evidence_hash" ~ '^[0-9a-f]{64}$'
  AND (("status" = 'PENDING_VALIDATION' AND "validated_by_user_id" IS NULL AND "validated_at" IS NULL AND "rejected_by_user_id" IS NULL AND "rejected_at" IS NULL)
    OR ("status" = 'CONFIRMED' AND "validated_by_user_id" IS NOT NULL AND "validated_at" IS NOT NULL AND "rejected_by_user_id" IS NULL AND "rejected_at" IS NULL)
    OR ("status" = 'REJECTED' AND "rejected_by_user_id" IS NOT NULL AND "rejected_at" IS NOT NULL AND "rejection_reason" IS NOT NULL AND "validated_by_user_id" IS NULL AND "validated_at" IS NULL))
);
ALTER TABLE "bingo_tie_breaks" ADD CONSTRAINT "bingo_tie_breaks_distinct_execution_check"
  CHECK ("origin_execution_id" <> "target_execution_id" AND char_length(btrim("reason")) > 0);

ALTER TABLE "bingo_command_idempotency" ADD CONSTRAINT "bingo_command_idempotency_hash_check" CHECK (
  "key_hash" ~ '^[0-9a-f]{64}$' AND "request_hash" ~ '^[0-9a-f]{64}$'
  AND (("status" = 'PROCESSING' AND "completed_at" IS NULL) OR ("status" <> 'PROCESSING' AND "completed_at" IS NOT NULL))
);
ALTER TABLE "bingo_outbox_events" ADD CONSTRAINT "bingo_outbox_events_lifecycle_check" CHECK (
  "sequence" > 0 AND "aggregate_version" >= 0 AND "attempt_count" >= 0
  AND (("status" = 'PUBLISHED' AND "published_at" IS NOT NULL) OR ("status" <> 'PUBLISHED' AND "published_at" IS NULL))
);

ALTER TABLE "bingo_import_batches" ADD CONSTRAINT "bingo_import_batches_file_check" CHECK (
  "sha256" ~ '^[0-9a-f]{64}$' AND "size_bytes" > 0
  AND COALESCE("sheet_count", 0) >= 0 AND COALESCE("row_count", 0) >= 0
  AND "valid_count" >= 0 AND "error_count" >= 0 AND "unresolved_count" >= 0
  AND ("row_count" IS NULL OR "valid_count" + "error_count" + "unresolved_count" <= "row_count")
  AND (("approved_by_user_id" IS NULL AND "approved_at" IS NULL) OR ("approved_by_user_id" IS NOT NULL AND "approved_at" IS NOT NULL))
  AND ("status" NOT IN ('APPROVED', 'APPLYING', 'COMPLETED') OR "approved_at" IS NOT NULL)
);
ALTER TABLE "bingo_import_rows" ADD CONSTRAINT "bingo_import_rows_lifecycle_check" CHECK (
  "row_number" > 0
  AND (("status" = 'APPLIED' AND "participant_id" IS NOT NULL AND "applied_at" IS NOT NULL)
    OR ("status" <> 'APPLIED' AND "applied_at" IS NULL))
);
ALTER TABLE "bingo_import_application_chunks" ADD CONSTRAINT "bingo_import_chunks_range_check" CHECK (
  "sequence" > 0 AND "first_row" > 0 AND "last_row" >= "first_row" AND "attempt_count" >= 0
  AND (("status" = 'COMPLETED' AND "completed_at" IS NOT NULL) OR "status" <> 'COMPLETED')
);

ALTER TABLE "bingo_audit_events" ADD CONSTRAINT "bingo_audit_events_hash_check" CHECK (
  char_length(btrim("action")) > 0 AND char_length(btrim("request_id")) > 0
  AND ("idempotency_key_hash" IS NULL OR "idempotency_key_hash" ~ '^[0-9a-f]{64}$')
  AND ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$')
  AND ("user_agent_hash" IS NULL OR "user_agent_hash" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "bingo_retention_policies" ADD CONSTRAINT "bingo_retention_policies_days_check" CHECK (
  "configured_retention_days" >= 0 AND "corporate_minimum_days" >= 0
  AND "effective_retention_days" >= "corporate_minimum_days"
  AND "effective_retention_days" >= "configured_retention_days"
);

CREATE INDEX "bingo_events_operable_idx" ON "bingo_events"("scheduled_start_at")
  WHERE "status" IN ('PUBLISHED', 'IN_PROGRESS');
CREATE INDEX "bingo_outbox_pending_idx" ON "bingo_outbox_events"("created_at")
  WHERE "status" IN ('PENDING', 'FAILED');

-- PostgreSQL does not create indexes for foreign keys.  These indexes cover
-- the remaining FK leading columns not already covered by a PK/unique/other
-- operational index, keeping RESTRICT checks and parent maintenance bounded.
CREATE INDEX "bingo_eligibility_rules_created_by_user_id_idx" ON "bingo_eligibility_rules"("created_by_user_id");
CREATE INDEX "bingo_external_subjects_resolved_by_user_id_idx" ON "bingo_authorized_external_subjects"("resolved_by_user_id");
CREATE INDEX "bingo_rounds_created_by_user_id_idx" ON "bingo_rounds"("created_by_user_id");
CREATE INDEX "bingo_round_executions_operator_user_id_idx" ON "bingo_round_executions"("operator_user_id");
CREATE INDEX "bingo_round_executions_supervisor_user_id_idx" ON "bingo_round_executions"("supervisor_user_id");
CREATE INDEX "bingo_round_executions_created_by_user_id_idx" ON "bingo_round_executions"("created_by_user_id");
CREATE INDEX "bingo_fairness_commitments_committed_by_user_id_idx" ON "bingo_fairness_commitments"("committed_by_user_id");
CREATE INDEX "bingo_fairness_commitments_revealed_by_user_id_idx" ON "bingo_fairness_commitments"("revealed_by_user_id");
CREATE INDEX "bingo_draws_drawn_by_user_id_idx" ON "bingo_draws"("drawn_by_user_id");
CREATE INDEX "bingo_winners_validated_by_user_id_idx" ON "bingo_winners"("validated_by_user_id");
CREATE INDEX "bingo_winners_rejected_by_user_id_idx" ON "bingo_winners"("rejected_by_user_id");
CREATE INDEX "bingo_command_idempotency_execution_event_idx" ON "bingo_command_idempotency"("execution_id", "event_id");
CREATE INDEX "bingo_outbox_events_execution_event_idx" ON "bingo_outbox_events"("execution_id", "event_id");
CREATE INDEX "bingo_import_batches_uploaded_by_user_id_idx" ON "bingo_import_batches"("uploaded_by_user_id");
CREATE INDEX "bingo_import_batches_approved_by_user_id_idx" ON "bingo_import_batches"("approved_by_user_id");

-- Event and round configuration that affects eligibility or outcomes is
-- immutable after lock. Status/timestamps remain mutable so the explicit
-- lifecycle can progress without rewriting the frozen policy.
CREATE FUNCTION "bingo_guard_event_configuration"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."configuration_locked_at" IS NOT NULL AND (
    NEW."eligibility_policy" IS DISTINCT FROM OLD."eligibility_policy"
    OR NEW."max_cards_per_participant" IS DISTINCT FROM OLD."max_cards_per_participant"
    OR NEW."public_winner_visibility" IS DISTINCT FROM OLD."public_winner_visibility"
    OR NEW."default_validation_policy" IS DISTINCT FROM OLD."default_validation_policy"
    OR NEW."fairness_mode" IS DISTINCT FROM OLD."fairness_mode"
    OR NEW."configuration_version" IS DISTINCT FROM OLD."configuration_version"
    OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
  ) THEN
    RAISE EXCEPTION 'Bingo event configuration is locked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_events_configuration_guard"
  BEFORE UPDATE ON "bingo_events"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_event_configuration"();

CREATE FUNCTION "bingo_guard_round_configuration"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."configuration_locked_at" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "bingo_round_executions" e WHERE e."round_id" = OLD."id"))
    AND (
      NEW."sequence" IS DISTINCT FROM OLD."sequence"
      OR NEW."validation_policy" IS DISTINCT FROM OLD."validation_policy"
      OR NEW."tie_policy" IS DISTINCT FROM OLD."tie_policy"
      OR NEW."tie_policy_configuration" IS DISTINCT FROM OLD."tie_policy_configuration"
      OR NEW."configuration_version" IS DISTINCT FROM OLD."configuration_version"
      OR NEW."configuration_locked_at" IS DISTINCT FROM OLD."configuration_locked_at"
    ) THEN
    RAISE EXCEPTION 'Bingo round configuration is locked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_rounds_configuration_guard"
  BEFORE UPDATE ON "bingo_rounds"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_round_configuration"();

-- Child configuration cannot be added, rewritten or removed after its event
-- or round is locked. New pattern versions may still be authored in an
-- unlocked event, but a pattern already bound to a locked round is immutable.
CREATE FUNCTION "bingo_guard_event_configuration_child"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE scoped_event UUID;
BEGIN
  scoped_event := CASE WHEN TG_OP = 'DELETE' THEN OLD."event_id" ELSE NEW."event_id" END;
  IF EXISTS (SELECT 1 FROM "bingo_events" WHERE "id" = scoped_event AND "configuration_locked_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'Bingo event child configuration is locked' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "bingo_eligibility_rules_configuration_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "bingo_eligibility_rules"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_event_configuration_child"();
CREATE TRIGGER "bingo_rounds_event_configuration_guard"
  BEFORE INSERT OR DELETE ON "bingo_rounds"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_event_configuration_child"();

CREATE FUNCTION "bingo_guard_round_configuration_child"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE scoped_round UUID;
BEGIN
  scoped_round := CASE WHEN TG_OP = 'DELETE' THEN OLD."round_id" ELSE NEW."round_id" END;
  IF EXISTS (
    SELECT 1 FROM "bingo_rounds" r
    WHERE r."id" = scoped_round AND (r."configuration_locked_at" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "bingo_round_executions" e WHERE e."round_id" = r."id"))
  ) THEN
    RAISE EXCEPTION 'Bingo round child configuration is locked' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "bingo_prizes_configuration_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "bingo_prizes"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_round_configuration_child"();
CREATE TRIGGER "bingo_round_patterns_configuration_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "bingo_round_patterns"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_round_configuration_child"();

CREATE FUNCTION "bingo_guard_bound_pattern"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE scoped_pattern UUID;
BEGIN
  scoped_pattern := CASE WHEN TG_OP = 'DELETE' THEN OLD."pattern_id" ELSE NEW."pattern_id" END;
  IF EXISTS (
    SELECT 1 FROM "bingo_round_patterns" rp
    JOIN "bingo_rounds" r ON r."id" = rp."round_id" AND r."event_id" = rp."event_id"
    WHERE rp."pattern_id" = scoped_pattern AND r."configuration_locked_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Bingo pattern is bound to a locked round' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "bingo_pattern_masks_configuration_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "bingo_pattern_masks"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_bound_pattern"();
CREATE FUNCTION "bingo_guard_pattern_definition"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "bingo_round_patterns" rp
    JOIN "bingo_rounds" r ON r."id" = rp."round_id" AND r."event_id" = rp."event_id"
    WHERE rp."pattern_id" = OLD."id" AND r."configuration_locked_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Bingo pattern definition is bound to a locked round' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "bingo_patterns_configuration_guard"
  BEFORE UPDATE OR DELETE ON "bingo_patterns"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_pattern_definition"();

-- Validate immutable execution snapshots against the locked configuration and
-- require the two distinct actors before a dual-control execution can start.
CREATE FUNCTION "bingo_guard_execution"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  round_row "bingo_rounds"%ROWTYPE;
  event_fairness "bingo_fairness_mode";
BEGIN
  -- Serializes assignment changes with the transition that starts operation
  -- for this event; otherwise both transactions could pass their checks from
  -- pre-commit snapshots.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."event_id"::text, 0));
  SELECT * INTO round_row FROM "bingo_rounds" WHERE "id" = NEW."round_id" AND "event_id" = NEW."event_id" FOR SHARE;
  SELECT "fairness_mode" INTO event_fairness FROM "bingo_events" WHERE "id" = NEW."event_id" FOR SHARE;

  IF round_row."configuration_locked_at" IS NULL
    OR NEW."validation_policy_snapshot" <> round_row."validation_policy"
    OR NEW."tie_policy_snapshot" <> round_row."tie_policy"
    OR NEW."configuration_version" <> round_row."configuration_version"
    OR NEW."fairness_mode_snapshot" <> event_fairness THEN
    RAISE EXCEPTION 'Bingo execution snapshot does not match locked configuration' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."round_id" IS DISTINCT FROM OLD."round_id"
    OR NEW."revision" IS DISTINCT FROM OLD."revision"
    OR NEW."previous_execution_id" IS DISTINCT FROM OLD."previous_execution_id"
    OR NEW."validation_policy_snapshot" IS DISTINCT FROM OLD."validation_policy_snapshot"
    OR NEW."tie_policy_snapshot" IS DISTINCT FROM OLD."tie_policy_snapshot"
    OR NEW."fairness_mode_snapshot" IS DISTINCT FROM OLD."fairness_mode_snapshot"
    OR NEW."configuration_version" IS DISTINCT FROM OLD."configuration_version"
  ) THEN
    RAISE EXCEPTION 'Bingo execution identity and snapshots are immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'PLANNED' THEN
    RAISE EXCEPTION 'A Bingo execution must be created PLANNED' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NOT (
    NEW."status" = OLD."status"
    OR (OLD."status" = 'PLANNED' AND NEW."status" IN ('RUNNING', 'CANCELLED'))
    OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('PAUSED', 'COMPLETED', 'CANCELLED'))
    OR (OLD."status" = 'PAUSED' AND NEW."status" IN ('RUNNING', 'COMPLETED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid Bingo execution lifecycle transition' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."started_at" IS NOT NULL AND (
    NEW."operator_user_id" IS DISTINCT FROM OLD."operator_user_id"
    OR NEW."supervisor_user_id" IS DISTINCT FROM OLD."supervisor_user_id"
  ) THEN
    RAISE EXCEPTION 'Execution actors are frozen after start' USING ERRCODE = '23514';
  END IF;

  IF NEW."status" IN ('RUNNING', 'PAUSED', 'COMPLETED') THEN
    IF NEW."operator_user_id" IS NULL THEN
      RAISE EXCEPTION 'A started Bingo execution requires an operator' USING ERRCODE = '23514';
    END IF;
    IF NEW."validation_policy_snapshot" = 'DUAL_CONTROL'
      AND (NEW."supervisor_user_id" IS NULL OR NEW."supervisor_user_id" = NEW."operator_user_id") THEN
      RAISE EXCEPTION 'Dual control requires distinct operator and supervisor' USING ERRCODE = '23514';
    END IF;
    IF NEW."fairness_mode_snapshot" = 'CRYPTO_RNG_COMMIT_REVEAL'
      AND NOT EXISTS (
        SELECT 1 FROM "bingo_fairness_commitments" c
        WHERE c."execution_id" = NEW."id" AND c."event_id" = NEW."event_id" AND c."published_at" IS NOT NULL
      ) THEN
      RAISE EXCEPTION 'Commit-reveal execution requires a published commitment before start' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_round_executions_guard"
  BEFORE INSERT OR UPDATE ON "bingo_round_executions"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_execution"();

-- Serialize active assignment counts on the participant row. This closes the
-- race where concurrent cards individually observe a count below the event
-- maximum. Operational assignment fields freeze permanently after the first
-- execution for the event has started; retention/legal-hold fields may still
-- be maintained by governance processes.
CREATE FUNCTION "bingo_guard_card_assignment"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  maximum_cards INTEGER;
  active_cards INTEGER;
  subject_id UUID;
  scoped_event UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bingo assignment history cannot be deleted' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'A Bingo assignment must be created ACTIVE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."card_id" IS DISTINCT FROM OLD."card_id"
    OR NEW."participant_id" IS DISTINCT FROM OLD."participant_id"
    OR NEW."assigned_at" IS DISTINCT FROM OLD."assigned_at"
  ) THEN
    RAISE EXCEPTION 'Bingo assignment identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" <> 'ACTIVE' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'A terminal Bingo assignment cannot be reactivated or rewritten' USING ERRCODE = '23514';
  END IF;

  scoped_event := NEW."event_id";
  PERFORM pg_advisory_xact_lock(hashtextextended(scoped_event::text, 0));
  IF EXISTS (
    SELECT 1 FROM "bingo_round_executions"
    WHERE "event_id" = scoped_event AND "started_at" IS NOT NULL
  ) AND (TG_OP = 'INSERT' OR
    NEW."round_context_id" IS DISTINCT FROM OLD."round_context_id"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."deactivated_at" IS DISTINCT FROM OLD."deactivated_at"
    OR NEW."superseded_by_assignment_id" IS DISTINCT FROM OLD."superseded_by_assignment_id"
    OR NEW."actor_user_id" IS DISTINCT FROM OLD."actor_user_id"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."request_id" IS DISTINCT FROM OLD."request_id") THEN
    RAISE EXCEPTION 'Bingo assignments are frozen after operation starts' USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'ACTIVE' THEN
    subject_id := NEW."participant_id";
    PERFORM 1 FROM "bingo_participants" WHERE "id" = subject_id AND "event_id" = scoped_event AND "status" = 'APPROVED' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only an approved participant can receive a Bingo card' USING ERRCODE = '23514';
    END IF;
    SELECT "max_cards_per_participant" INTO maximum_cards FROM "bingo_events" WHERE "id" = scoped_event FOR SHARE;
    SELECT count(*) INTO active_cards FROM "bingo_card_assignments"
      WHERE "event_id" = scoped_event AND "participant_id" = subject_id AND "status" = 'ACTIVE'
        AND "id" <> NEW."id";
    IF active_cards >= maximum_cards THEN
      RAISE EXCEPTION 'Bingo participant card limit exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_card_assignments_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "bingo_card_assignments"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_card_assignment"();

-- A commitment is immutable except for its one-way publication/reveal fields.
-- Reveal is only legal after the execution has officially closed.
CREATE FUNCTION "bingo_guard_fairness_commitment"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE execution_status "bingo_execution_status";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bingo fairness evidence cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."execution_id" IS DISTINCT FROM OLD."execution_id"
    OR NEW."hash_algorithm" IS DISTINCT FROM OLD."hash_algorithm"
    OR NEW."rng_algorithm" IS DISTINCT FROM OLD."rng_algorithm"
    OR NEW."protocol_version" IS DISTINCT FROM OLD."protocol_version"
    OR NEW."commitment_hash" IS DISTINCT FROM OLD."commitment_hash"
    OR NEW."seed_ciphertext" IS DISTINCT FROM OLD."seed_ciphertext"
    OR NEW."custody_key_id" IS DISTINCT FROM OLD."custody_key_id"
    OR NEW."committed_by_user_id" IS DISTINCT FROM OLD."committed_by_user_id"
    OR NEW."committed_at" IS DISTINCT FROM OLD."committed_at"
    OR (OLD."published_at" IS NOT NULL AND NEW."published_at" IS DISTINCT FROM OLD."published_at")
    OR (OLD."revealed_at" IS NOT NULL AND (
      NEW."revealed_seed" IS DISTINCT FROM OLD."revealed_seed"
      OR NEW."revealed_by_user_id" IS DISTINCT FROM OLD."revealed_by_user_id"
      OR NEW."revealed_at" IS DISTINCT FROM OLD."revealed_at"
      OR NEW."reveal_evidence_hash" IS DISTINCT FROM OLD."reveal_evidence_hash"))
  ) THEN
    RAISE EXCEPTION 'Bingo fairness commitment is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."revealed_at" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."revealed_at" IS NULL) THEN
    SELECT "status" INTO execution_status FROM "bingo_round_executions"
      WHERE "id" = NEW."execution_id" AND "event_id" = NEW."event_id" FOR SHARE;
    IF execution_status NOT IN ('COMPLETED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Bingo seed may only be revealed after execution closure' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_fairness_commitments_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "bingo_fairness_commitments"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_fairness_commitment"();

-- Cross-row evidence consistency that cannot be represented by Prisma FKs.
CREATE FUNCTION "bingo_guard_draw_scope"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "bingo_command_idempotency" i
    WHERE i."id" = NEW."idempotency_record_id"
      AND i."event_id" = NEW."event_id"
      AND i."execution_id" = NEW."execution_id"
  ) THEN
    RAISE EXCEPTION 'Draw idempotency record belongs to another scope' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_draws_scope_guard"
  BEFORE INSERT ON "bingo_draws"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_draw_scope"();

CREATE FUNCTION "bingo_guard_candidate_decisive_ball"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "bingo_win_groups" g
    JOIN "bingo_draws" d ON d."id" = g."decisive_draw_id"
    WHERE g."id" = NEW."win_group_id" AND g."execution_id" = NEW."execution_id"
      AND g."event_id" = NEW."event_id" AND d."ball_number" = NEW."decisive_ball"
  ) THEN
    RAISE EXCEPTION 'Candidate decisive ball does not match its win group draw' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_winner_candidates_decisive_ball_guard"
  BEFORE INSERT OR UPDATE OF "decisive_ball" ON "bingo_winner_candidates"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_candidate_decisive_ball"();

CREATE FUNCTION "bingo_guard_winner_validation"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE execution_row "bingo_round_executions"%ROWTYPE;
BEGIN
  SELECT * INTO execution_row FROM "bingo_round_executions"
    WHERE "id" = NEW."execution_id" AND "round_id" = NEW."round_id" AND "event_id" = NEW."event_id" FOR SHARE;
  IF NEW."validation_policy_snapshot" <> execution_row."validation_policy_snapshot" THEN
    RAISE EXCEPTION 'Winner validation policy does not match execution' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'CONFIRMED' AND NEW."validation_policy_snapshot" = 'DUAL_CONTROL'
    AND (execution_row."supervisor_user_id" IS NULL
      OR NEW."validated_by_user_id" <> execution_row."supervisor_user_id"
      OR NEW."validated_by_user_id" = execution_row."operator_user_id") THEN
    RAISE EXCEPTION 'Dual-control winner requires the distinct execution supervisor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bingo_winners_validation_guard"
  BEFORE INSERT OR UPDATE ON "bingo_winners"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_winner_validation"();

-- Empty executions and assignments are still historical revisions/evidence;
-- cancellation/revocation creates state, never physical deletion.
CREATE FUNCTION "bingo_reject_evidence_delete"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bingo domain evidence cannot be deleted' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "bingo_round_executions_no_delete" BEFORE DELETE ON "bingo_round_executions"
  FOR EACH ROW EXECUTE FUNCTION "bingo_reject_evidence_delete"();
CREATE TRIGGER "bingo_win_groups_no_delete" BEFORE DELETE ON "bingo_win_groups"
  FOR EACH ROW EXECUTE FUNCTION "bingo_reject_evidence_delete"();
CREATE TRIGGER "bingo_winner_candidates_no_delete" BEFORE DELETE ON "bingo_winner_candidates"
  FOR EACH ROW EXECUTE FUNCTION "bingo_reject_evidence_delete"();
CREATE TRIGGER "bingo_winners_no_delete" BEFORE DELETE ON "bingo_winners"
  FOR EACH ROW EXECUTE FUNCTION "bingo_reject_evidence_delete"();

-- Draws and audit events are append-only evidence. Corrections are expressed
-- as new domain/audit rows, never by rewriting confirmed evidence.
CREATE FUNCTION "bingo_reject_evidence_mutation"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bingo evidence is append-only';
END;
$$;
CREATE TRIGGER "bingo_draws_append_only"
  BEFORE UPDATE OR DELETE ON "bingo_draws"
  FOR EACH ROW EXECUTE FUNCTION "bingo_reject_evidence_mutation"();
CREATE TRIGGER "bingo_audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "bingo_audit_events"
  FOR EACH ROW EXECUTE FUNCTION "bingo_reject_evidence_mutation"();
