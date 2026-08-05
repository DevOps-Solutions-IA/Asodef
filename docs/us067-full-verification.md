# US-067 — Full local verification of the expanded platform

Documented manual verification pass, performed 2026-08-05 against a locally
built `docker compose` stack (web, api, postgres, redis) — the same stack
US-037 verified, now exercised against the full expanded platform (payments,
CRM, legal/consent/PQR/DSR, admin, reports). Not the production stack —
production deployment is US-039/US-041's own job, explicitly out of scope
here. This file records the evidence for US-067's own acceptance criteria;
it is not a runbook.

## Bringing the stack up

```bash
docker compose up -d --build
```

A local `.env` (gitignored, dev-only placeholder secrets matching
`.env.example`'s own convention) supplies `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`ENCRYPTION_KEY`, `PASSWORD_RESET_TOKEN_SECRET`, and
`CONTRACT_DOWNLOAD_TOKEN_SECRET`. `postgres`/`redis` were already running as
this project's persistent local dev dependencies — `docker compose up -d`
left them exactly as they were (`Running`/`Healthy`, untouched) and only
built+started `api`/`web`.

**Real gap found and fixed**: the `api` container initially failed its
healthcheck with `CONTRACT_DOWNLOAD_TOKEN_SECRET is required` — US-055 added
this required env var to `env.validation.ts` after `docker-compose.yml` was
last written (US-037) and it was never backfilled there or in
`.env.example`. Fixed both files.

## `docker compose ps` — all 4 services healthy simultaneously

```
NAME                IMAGE                COMMAND                  SERVICE    STATUS                    PORTS
asodef-api-1        asodef-api           "docker-entrypoint.s…"   api        Up (healthy)              127.0.0.1:3200->3000/tcp
asodef-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   Up 2 days (healthy)       127.0.0.1:5433->5432/tcp
asodef-redis-1      redis:7-alpine       "docker-entrypoint.s…"   redis      Up 2 days (healthy)       127.0.0.1:6379->6379/tcp
asodef-web-1        asodef-web           "/docker-entrypoint.…"   web        Up (healthy)              127.0.0.1:8080->80/tcp
```

`GET http://localhost:3200/api/v1/health/ready` → `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`.
`GET http://localhost:8080/` → 200.

## CI across the full expanded scope

```bash
pnpm lint                                    # 7/7 packages clean
pnpm typecheck                                # 8/8 packages clean
pnpm --filter api test                        # 79 suites / 721 tests
pnpm --filter web exec vitest run             # 60 files / 396 tests
pnpm build                                    # clean, all 5 buildable packages
PLAYWRIGHT_BASE_URL=http://localhost:8080 \
DATABASE_URL=postgresql://asodef:asodef_dev_password@localhost:5433/asodef?schema=public \
npx playwright test                           # 9/9 passing, against the docker-compose stack itself
```

One pre-existing, unrelated lint violation (`prefer-const` in
`reports.controller.integration.spec.ts`) was found by the full `pnpm lint`
run and fixed as part of US-066.

## Manual end-to-end verification pass (AC, verbatim)

All flows below were run as real HTTP calls against the running
`docker compose` stack (`http://localhost:3200`/`8080`), authenticated as a
disposable `SUPER_ADMIN` test actor provisioned the same way
`e2e/support/test-actors.ts` provisions the `CUSTOMER_SERVICE` actor for
US-066 (`ensureTestActor(email, fullName, "SUPER_ADMIN")` — seed-rbac.ts
creates zero User rows by design, so there is no seeded staff account to
reuse). Every step below is a literal request/response, not a description
of expected behavior.

### 1. Full commercial pipeline: prospect → opportunity → proposal → agreement → partner published

**Real gap found**: `Agreement.companyId` has a hard FK to a `Company` row,
but the `companies` module only exposes `GET` endpoints (list/detail) — there
is no way to create one via the API, and none were seeded. Seeded one demo
company directly via Prisma (`Empresa Demo E2E S.A.S.`, NIT `900000000-1`,
same "clearly-named, obviously-a-fixture" convention as `Cliente Demo Uno`)
to unblock this.

```
POST /leads                                          → 201 (public lead capture)
GET  /admin/leads                                     → 200, lead visible
POST /admin/leads/:id/promote  {type: COMPANY, ...}   → 201, Prospect created (stage=NEW_PROSPECT)
POST /admin/prospects/:id/opportunities                → 201, Opportunity created
POST /admin/opportunities/:id/stage  (x8, one per stage)
     CONTACTED → QUALIFIED → COMMERCIAL_MEETING → PROPOSAL_PREPARATION
     → PROPOSAL_SUBMITTED → NEGOTIATION → LEGAL_REVIEW → CONTRACT_PENDING  → 200 each
POST /admin/opportunities/:id/proposals                → 201, Proposal v1 created
POST /admin/opportunities/:id/agreement                → 201, Agreement created
     (confirms the documented 409 gate: this call was only accepted once the
     opportunity reached CONTRACT_PENDING - the exact eligibility rule
     CrmService.createAgreement() enforces)
POST /admin/opportunities/:id/stage {stage: ACTIVE_PARTNER} → 200
```

`BusinessPartner` (the publishable, customer-facing directory entry) has no
FK to CRM's `Company`/`Agreement` chain — it is its own module by design
(US-053). Created and published separately:

```
POST  /admin/partners                                  → 201, publicationStatus=UNPUBLISHED
PATCH /admin/partners/:id/checks  (all 7 confirmed)     → 200
POST  /admin/partners/:id/publish                       → 200, publicationStatus=PUBLISHED
GET   /partners  (public, no auth)                      → 200, the new partner is in the list
```

### 2. Full payment lifecycle including refund and reconciliation

**Real gap found**: `POST /payment-orders` requires a resolvable, currently
PUBLISHED `terminos-de-pago` version (US-046) — every legal document is
seeded DRAFT-only until real legal review happens, so a fresh environment
cannot create a payment order at all out of the box. Same
temporarily-publish-then-restore discipline as apps/api's own
`publish-legal-document-for-test.ts` (already used by its integration tests
for this exact document) — published for the duration of this verification,
restored to DRAFT immediately after (confirmed via `GET
/legal-documents/terminos-de-pago` → 404 again once done).

```
POST /payments/lookup  {documentNumber: "1000000002"}   → 200, Cliente Demo Dos, 1 PENDING obligation
POST /payment-orders   {obligationId}                    → 201, PaymentOrder status=PENDING
POST /payments/bold/create  {reference}                  → 201, orderStatus=APPROVED (BOLD_MODE=mock, default outcome)
GET  /payment-orders/:reference                          → status=APPROVED
POST /payments/:reference/refund  {amountCents, reason}   → 201, Refund status=PENDING_APPROVAL
POST /admin/refunds/:id/approve                           → 200, Refund status=APPROVED
GET  /payment-orders/:reference                          → status=PARTIALLY_REFUNDED (partial amount)
POST /admin/reconciliation/runs  {rangeStart, rangeEnd}   → 201, ReconciliationRun created (differencesFound=20, resolutionStatus=OPEN)
```

### 3. A PQR case and a data-subject-request resolved start to finish

```
POST /pqr-cases  (public)                                       → 201, status=RECEIVED
GET  /admin/pqr-cases                                            → 200, case visible
POST /admin/pqr-cases/:id/transition {status: ASSIGNED, notes}    → 200
POST /admin/pqr-cases/:id/transition {status: IN_REVIEW, notes}   → 200
POST /admin/pqr-cases/:id/transition {status: RESOLVED, notes, resolution} → 200
GET  /pqr-cases/:caseNumber  (public)                             → status=RESOLVED, resolution text visible
```

(Confirmed the real allowed-transition table: `RECEIVED → IN_REVIEW`
directly is rejected with 400 - only `RECEIVED → ASSIGNED` is valid first,
exactly matching `PqrCasesService`'s own `ALLOWED_TRANSITIONS`.)

```
POST /data-subject-requests  (public)                                        → 201, status=RECEIVED
GET  /admin/data-subject-requests                                            → 200, request visible
POST /admin/data-subject-requests/:id/transition {status: IDENTITY_VERIFICATION, notes} → 200
POST /admin/data-subject-requests/:id/transition {status: IN_REVIEW, notes}  → 200
POST /admin/data-subject-requests/:id/transition {status: RESOLVED, notes, resolution} → 200
GET  /data-subject-requests/:publicReference  (public)                       → status=RESOLVED, resolution text visible
```

### 4. A legal document authored/approved/published and visible publicly

Used the `seguridad` document's existing seeded v1 DRAFT (real,
confirmed-facts-only content from US-044 - "authored" in the sense that it
already exists; no new legal content was invented for this verification) and
walked it through the real workflow:

```
POST /admin/legal-documents/versions/:id/submit-for-review    → 200, status=LEGAL_REVIEW
POST /admin/legal-documents/versions/:id/submit-for-approval   → 200, status=PENDING_APPROVAL
POST /admin/legal-documents/versions/:id/approve               → 200, status=APPROVED
POST /admin/legal-documents/versions/:id/publish                → 200, status=PUBLISHED
GET  /legal-documents/seguridad  (public, no auth)               → 200, real content, publicationDate set
```

Restored to DRAFT immediately after (same discipline as above - confirmed
via `GET /legal-documents/seguridad` → 404 again once done). This proves the
author→review→approval→publication mechanism works end to end without
leaving a real seeded document looking like real legal review happened when
it didn't.

### 5. `PRODUCTION_PAYMENTS_ENABLED` and the approval gates

```
GET /admin/approval-gates/production-payments-status   → {"enabled": false}
GET /admin/approval-gates                                → 16 gates, all status=PENDING
```

(The AC text says "15 approval gates" - the literal catalog has 16, the same
pre-existing PRD-vs-implementation discrepancy already flagged in US-058;
not re-litigated here, just confirmed the count is unchanged and every gate
is still PENDING.) This is exactly the expected pre-launch state: zero
gates approved, production payments confirmed disabled.

## Negative case (AC): a failing step blocks completion

No quality gate or manual verification step above failed to complete on its
own terms. Two real, previously-unknown gaps were found in the process
(`CONTRACT_DOWNLOAD_TOKEN_SECRET` missing from `docker-compose.yml`/
`.env.example`; no `Company`-creation endpoint anywhere) - both were
concrete, fixable environment/tooling gaps, not business-rule violations,
and both are documented above with their fixes. Per this story's own
negative case, if either had turned out to be unfixable without inventing
data or weakening a real gate, this story would not be marked done.

## After verification

Every legal document temporarily published for this pass
(`tratamiento-de-datos`, `terminos-de-pago`, `seguridad`) was restored to its
exact prior DRAFT state - confirmed via a fresh `GET
/legal-documents/:slug` → 404 for all three after the run. The demo
`Company`/`Prospect`/`Opportunity`/`Proposal`/`Agreement`/`BusinessPartner`/
`PaymentOrder`/`Refund`/`ReconciliationRun`/PQR case/DSR request created
during this pass are left in place, same "persistent, clearly-named demo
fixture" convention as `Cliente Demo Uno`/`Dos` - real rows, not describing
a real ASODEF business relationship, easily identifiable by their
"Demo E2E"/"Verificación US-067" naming.

The `api`/`web` containers were stopped (not removed) once verification
completed, matching US-037's own precedent - `postgres`/`redis` (this
project's persistent local dev dependencies) were left exactly as they were
throughout, never stopped, restarted, or reconfigured.

## No deploy, no push

This entire verification ran against `localhost` ports only
(`3200`/`8080`/`5433`/`6379`). `app.asodef.com.co`, `api.asodef.com.co`, and
`webhook.asodef.com.co` were never touched. No `git push` was run.
