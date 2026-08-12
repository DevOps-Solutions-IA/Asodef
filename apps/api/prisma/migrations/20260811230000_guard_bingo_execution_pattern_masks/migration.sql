-- DrawNextBall uses the immutable, precalculated bit(75) masks selected in
-- ETAPA 3. Fail closed at the PLANNED -> RUNNING boundary if any eligible card
-- lacks the complete mask set for any pattern bound to the round.
CREATE FUNCTION bingo_assert_execution_pattern_masks_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'RUNNING'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM bingo_card_assignments assignment
       INNER JOIN bingo_participants participant
         ON participant.id = assignment.participant_id
        AND participant.event_id = assignment.event_id
       CROSS JOIN bingo_round_patterns round_pattern
       CROSS JOIN LATERAL (
         SELECT count(*) AS expected_count
         FROM bingo_pattern_masks pattern_mask
         WHERE pattern_mask.pattern_id = round_pattern.pattern_id
           AND pattern_mask.event_id = NEW.event_id
       ) expected
       CROSS JOIN LATERAL (
         SELECT count(*) AS prepared_count
         FROM bingo_card_pattern_masks card_mask
         WHERE card_mask.card_id = assignment.card_id
           AND card_mask.event_id = NEW.event_id
           AND card_mask.pattern_id = round_pattern.pattern_id
       ) prepared
       WHERE assignment.event_id = NEW.event_id
         AND assignment.status = 'ACTIVE'
         AND participant.status = 'APPROVED'
         AND round_pattern.round_id = NEW.round_id
         AND round_pattern.event_id = NEW.event_id
         AND (
           assignment.round_context_id IS NULL
           OR assignment.round_context_id = NEW.round_id
         )
         AND (
           expected.expected_count = 0
           OR prepared.prepared_count <> expected.expected_count
         )
     )
  THEN
    RAISE EXCEPTION
      'BINGO_CARD_PATTERN_MASKS_INCOMPLETE: execution % cannot start', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bingo_execution_pattern_masks_ready_guard
  BEFORE UPDATE OF status ON bingo_round_executions
  FOR EACH ROW
  EXECUTE FUNCTION bingo_assert_execution_pattern_masks_ready();
