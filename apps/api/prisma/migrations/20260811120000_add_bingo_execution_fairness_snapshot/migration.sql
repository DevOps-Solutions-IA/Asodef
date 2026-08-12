-- ETAPA 5 requires every started execution to carry a reproducible fairness
-- snapshot independently of whether commit-reveal is enabled. Columns remain
-- nullable only so an expand-only deployment can preserve pre-existing
-- PLANNED rows; the transition guard fails closed before operation starts.
ALTER TABLE "bingo_round_executions"
  ADD COLUMN "configuration_hash" CHAR(64),
  ADD COLUMN "fairness_protocol_version" TEXT;

ALTER TABLE "bingo_round_executions"
  ADD CONSTRAINT "bingo_round_executions_fairness_snapshot_check" CHECK (
    ("configuration_hash" IS NULL AND "fairness_protocol_version" IS NULL)
    OR (
      "configuration_hash" IS NOT NULL
      AND "fairness_protocol_version" IS NOT NULL
      AND "configuration_hash" ~ '^[0-9a-f]{64}$'
      AND length(btrim("fairness_protocol_version")) BETWEEN 1 AND 100
    )
  );

CREATE FUNCTION "bingo_guard_execution_fairness_snapshot"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    (OLD."configuration_hash" IS NOT NULL AND NEW."configuration_hash" IS DISTINCT FROM OLD."configuration_hash")
    OR (OLD."fairness_protocol_version" IS NOT NULL AND NEW."fairness_protocol_version" IS DISTINCT FROM OLD."fairness_protocol_version")
  ) THEN
    RAISE EXCEPTION 'Bingo execution fairness snapshot is immutable once assigned'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" IN ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED')
    AND (NEW."configuration_hash" IS NULL OR NEW."fairness_protocol_version" IS NULL) THEN
    RAISE EXCEPTION 'Bingo execution requires a complete fairness snapshot before leaving PLANNED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "bingo_round_executions_fairness_snapshot_guard"
  BEFORE INSERT OR UPDATE ON "bingo_round_executions"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_execution_fairness_snapshot"();
