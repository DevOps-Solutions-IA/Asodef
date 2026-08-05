-- US-046 bug fix: the original consent_records_exactly_one_subject_check
-- (sum = 1) is incompatible with onDelete: SetNull on the three subject
-- FKs. Deleting a User/LeadSubmission/Customer that a consent record
-- points to nulls that one FK out - if it was the record's only subject,
-- the row now has zero set, which a "= 1" check rejects, hard-failing
-- the very deletion that was supposed to succeed (discovered via a
-- hanging/failing integration test, not by inspection).
--
-- Fix: relax the constraint to "at most one" (<= 1). Exactly one
-- non-null subject is still guaranteed at creation time by
-- ConsentService.record()'s own discriminated-union parameter type -
-- this constraint only needs to keep guarding against the case a "= 1"
-- check can't safely allow: two subjects set simultaneously. A record
-- that has been legitimately zeroed out by a subject's deletion (e.g. a
-- future data-subject-erasure request) is expected, durable evidence
-- surviving without a traceable subject - not a data integrity error.
ALTER TABLE "consent_records" DROP CONSTRAINT "consent_records_exactly_one_subject_check";

ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_at_most_one_subject_check"
  CHECK (
    (CASE WHEN "user_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "lead_submission_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "customer_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );
