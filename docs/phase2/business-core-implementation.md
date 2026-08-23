# Phase 2 — Business Core Maturity implementation

Status: implemented and fully verified locally; pending Git authorization.

## Verification status

- Reports isolation regression: passed three consecutive isolated runs.
- Migration/seed contract: 43 migrations and three stable seed runs passed.
- API tests, Web tests, lint, typecheck, build and security checks passed.
- Host storage was recovered by pruning only unused Docker build cache older
  than 24 hours; running containers, images, volumes and networks were kept.
- Full E2E passed 41/41 before and after synchronizing the branch with the
  current `origin/main` (`f5f746ce1e4590f555a44425b6b7c780a2dbfc8c`).
- The complete post-sync `pnpm ci:verify` gate passed, including migration,
  source, security, production artifact, immutable image and E2E checks.
- No Phase 2 commit, merge commit, push or pull request was created; the branch
  base was advanced by a clean fast-forward to the current `origin/main`.

## Closed gaps

- Server-side pagination, bounded page sizes, search, filters, sorting and stable ordering for leads, prospects, opportunities, companies and business partners.
- Composite PostgreSQL indexes aligned with the default list/filter paths.
- Transactional audit events for opportunity creation, stage changes, assignment, activity creation/completion, proposals and agreements, including actor, request/correlation context and structured target metadata.
- Optimistic concurrency on opportunity stage/assignment, prospect assignment and partner checklist/publication/contact writes; activity completion is atomic.
- Proposal version allocation is serialized per opportunity to prevent duplicate versions under concurrent writes.
- Administrative idempotency is isolated from self-service and scoped by actor + operation + key + canonical request hash; proposal/agreement writes support safe replay and reject key reuse with payload drift.
- Ownership reuses `assignedUserId` and validates that the assignee exists and is active.
- Company contacts reuse `CommercialContact`; company sites add the missing aggregate entity with one-primary-site enforcement. Partner contact handling reuses `commercialContactId`/`CommercialContact`.
- Existing `CommercialActivity` types remain the source for notes, tasks and follow-ups. Opportunity detail adds a bounded unified timeline over history, activities, proposals, agreements and audit evidence.
- Twelve future AI tool contracts declare required RBAC, bounded JSON schemas, structured responses, idempotency policy and the existing application-service boundary. No chatbot, executor, SQL access or privileged bypass was added.

## Deliberate boundaries

- Legal was not modified. Partner-specific audit persistence was not added because the shared `AuditLog` exactly-one-entity constraint also serves Legal; changing that shared schema would violate the explicit Legal exclusion. Partner concurrency and validation were hardened without altering Legal.
- Mail, Master/Firebird, R3, Bold/Payments and production infrastructure were not modified.
- No Phase 2 commit, merge commit, push or pull request was created.
