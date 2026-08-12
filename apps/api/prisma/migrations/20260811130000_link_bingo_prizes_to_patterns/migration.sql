-- A round can carry several patterns and several prizes. The Stage 3 model
-- scoped both to a round but did not say which pattern awards which prize.
-- Keep the new columns nullable for expand-only deployment, then fail closed
-- before operation starts until every prize is mapped explicitly.
ALTER TABLE "bingo_prizes"
  ADD COLUMN "round_pattern_id" UUID,
  ADD COLUMN "pattern_id" UUID;

ALTER TABLE "bingo_prizes"
  ADD CONSTRAINT "bingo_prizes_pattern_mapping_check" CHECK (
    ("round_pattern_id" IS NULL AND "pattern_id" IS NULL)
    OR ("round_pattern_id" IS NOT NULL AND "pattern_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX "bingo_prizes_pattern_scope_key"
  ON "bingo_prizes"("id", "round_id", "event_id", "round_pattern_id", "pattern_id");
CREATE INDEX "bingo_prizes_round_pattern_scope_idx"
  ON "bingo_prizes"("round_pattern_id", "round_id", "event_id", "pattern_id");

ALTER TABLE "bingo_prizes"
  ADD CONSTRAINT "bingo_prizes_round_pattern_scope_fkey"
  FOREIGN KEY ("round_pattern_id", "round_id", "event_id", "pattern_id")
  REFERENCES "bingo_round_patterns"("id", "round_id", "event_id", "pattern_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Win groups cannot cross the configured prize-pattern mapping.
ALTER TABLE "bingo_win_groups"
  DROP CONSTRAINT "bingo_win_groups_prize_id_round_id_event_id_fkey";
ALTER TABLE "bingo_win_groups"
  ADD CONSTRAINT "bingo_win_groups_prize_pattern_scope_fkey"
  FOREIGN KEY ("prize_id", "round_id", "event_id", "round_pattern_id", "pattern_id")
  REFERENCES "bingo_prizes"("id", "round_id", "event_id", "round_pattern_id", "pattern_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "bingo_guard_execution_prize_mapping"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IN ('RUNNING', 'PAUSED', 'COMPLETED')
    AND EXISTS (
      SELECT 1 FROM "bingo_prizes" p
      WHERE p."round_id" = NEW."round_id" AND p."event_id" = NEW."event_id"
        AND (p."round_pattern_id" IS NULL OR p."pattern_id" IS NULL)
    ) THEN
    RAISE EXCEPTION 'Every Bingo prize requires an explicit round pattern before operation starts'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "bingo_round_executions_prize_mapping_guard"
  BEFORE INSERT OR UPDATE ON "bingo_round_executions"
  FOR EACH ROW EXECUTE FUNCTION "bingo_guard_execution_prize_mapping"();
