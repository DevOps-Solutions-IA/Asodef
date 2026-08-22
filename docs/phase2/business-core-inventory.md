# Phase 2 — Enterprise Business Core inventory

Status: VERIFIED against `origin/main` at `5f264531dfb0620282a3c7fa5ab460987d3df3d1` on 2026-08-20. No production or Phase 1 Mail infrastructure was inspected or changed beyond repository-level inventory.

## Required inventory result

`PHASE2_INVENTORY=PASS`

`CRM_EXISTING=Prospect, LeadSubmission promotion, Opportunity, 14-stage pipeline, stage history, CommercialActivity, Proposal and Agreement are implemented in Prisma, NestJS, admin React pages, API clients, query keys, RBAC and integration/component tests.`

`COMPANIES_EXISTING=Company table, companies.read/companies.manage, normalized-NIT creation, list/detail API, creation audit entry, list/detail/create UI and an E2E company flow exist.`

`PARTNERS_EXISTING=BusinessPartner table, partners.manage API, create/list/detail, seven publication gates, public projection, admin list/detail UI and integration/component tests exist.`

`OPPORTUNITIES_EXISTING=Create/list/detail, board UI, stage changes, skipped-stage warning, status history, assignment fields and opportunity detail exist.`

`PROPOSALS_EXISTING=Versioned Proposal rows, create/list API and opportunity-detail UI exist; latest version is computed as current.`

`AGREEMENTS_EXISTING=Agreement rows, stage-gated creation, list API and opportunity-detail UI exist.`

`LEGAL_EXISTING=Versioned documents with draft/review/approval/publish/archive workflow, differentiated content.manage/legal.approve RBAC, public/admin UI, audit trail and tests exist.`

`CONSENT_EXISTING=Consent evidence, purpose/version metadata, admin subject/purpose search, self-service revoke/read paths, UI and integration tests exist.`

`DSR_EXISTING=Public intake/status, admin paginated/filterable queue, assignment, guarded transitions, UI and integration tests exist.`

`PQR_EXISTING=Public intake/status, admin paginated/filterable queue, assignment, guarded transitions, UI and integration tests exist.`

`REPORTS_EXISTING=Report catalog/run API, filters, CSV and durable export-job queue, polling UI, RBAC and tests exist.`

`REUSE_PLAN=Extend the existing Prisma models, NestJS modules/controllers/services, RequirePermissions decorators, AuditService, API client, React Query keys and current /admin/crm routes. Do not introduce a parallel CRM or duplicate business tables.`

`TOP_10_GAPS=1) server-side CRM/company/partner search, filtering, pagination and sorting; 2) comprehensive mutation audit coverage; 3) optimistic concurrency/version checks; 4) administrative mutation idempotency; 5) enforced ownership/tenant boundaries; 6) contact lifecycle APIs/UI; 7) company locations/sites; 8) richer notes/task lifecycle and reassignment; 9) negative/concurrency/E2E coverage across the complete CRM flow; 10) governed AI tool contracts and structured responses.`

`DUPLICATION_RISKS=Creating a second CRM; modeling leads separately from LeadSubmission/Prospect; adding parallel company/partner/contact/activity/note tables without mapping existing models; bypassing AuditService/RBAC/React Query; reusing self-service idempotency records outside their session scope.`

`MIGRATION_IMPACT=Search/filter/pagination, audit completion and tool-contract definitions require no migration. Reliable optimistic locking and admin idempotency require additive PostgreSQL migration(s). Contact/site expansion may require additive tables only after mapping CommercialContact and Company.contact* fields. No destructive migration is justified.`

`API_IMPACT=Existing array list endpoints need backward-compatible query contracts or a coordinated versioned/page response; mutations need audit, actor context, idempotency and concurrency preconditions. Existing routes and permissions remain authoritative.`

`WEB_IMPACT=Existing pages are reusable. Query keys must include server-side filters/page/sort; tables need pagination/error/empty states; mutation UX needs conflict/idempotency handling. Current route guards and layouts remain.`

`AI_READINESS_GAPS=No governed CRM tool registry/contracts exist. Future tools need explicit schemas, permission mapping, actor/ownership context, audit metadata, idempotency for creates/transitions/completion, structured success/error envelopes and no direct SQL capability.`

## Component maturity matrix

| Component | Existing | Maturity | Gaps | Risk | Action |
|---|---|---|---|---|---|
| CRM aggregate | Prisma models, `CrmModule`, admin routes/pages, client/types/keys | PARTIAL | Unbounded lists; uneven audit; no concurrency/idempotency | High at scale | Harden existing module |
| Leads / prospects | LeadSubmission promotion, prospect list/detail and UI | PARTIAL | No server search/page/sort; promotion is not audited/idempotent; ownership not enforced | High | Add query contract and governed mutation controls |
| Opportunities | Board/detail/stage history/assignment fields | PARTIAL | Unbounded list; stale-write race; no owner boundary; creation not audited | High | Add filters/page/sort, concurrency and audit |
| Activities / tasks | Schedule/list/complete with assignee, due date and note | PARTIAL | Completion race; no edit/reopen/cancel; no mutation audit/idempotency | High | Harden completion/create first |
| Proposals | Per-opportunity versions and latest marker | HARDENING_REQUIRED | `max+1` can collide concurrently; no status transition endpoint/audit/idempotency | High | Serialize/retry or optimistic claim; audit |
| Agreements | Stage-gated create/list | HARDENING_REQUIRED | Free-form status; no lifecycle/update/audit/idempotency; company/opportunity consistency not validated | High | Add safe validation/audit; taxonomy remains human-owned |
| Companies | Create/list/detail UI/API; NIT uniqueness; creation audit | PARTIAL | Unbounded list; no update; one denormalized contact; no sites; no concurrency | High | Query hardening first; model expansion later |
| Business partners | Full record and seven publication checks | PARTIAL / BLOCKED | No server query; no audit/concurrency/idempotency; 9-state taxonomy explicitly unresolved in schema comments | High | Harden existing paths; do not invent taxonomy |
| Contacts | CommercialContact relation plus Company contact fields | PARTIAL / DUPLICATE_RISK | No CRUD/UI; prospect is mandatory; cannot cleanly represent all company contacts | High | Map/extend existing model before any new table |
| Locations / sites | City/address scalar fields only | MISSING | No multi-site model/API/UI | Medium | Additive design requires product rules |
| Timeline / notes | Stage history, activity notes, audit timeline | PARTIAL | No unified CRM timeline or standalone notes | Medium | Compose existing sources before adding storage |
| RBAC | crm.read/manage, companies.read/manage, partners.manage and route guards | HARDENING_REQUIRED | Partner reads require manage; assignment does not enforce owner scope | High | Preserve gates; define scope rules |
| Audit | Generic AuditService/timeline and structured request logs | PARTIAL | Only opportunity stage and company create cover priority-domain mutations | High | Add audit calls transactionally |
| Legal | Versioned workflow, approvals, publication and UI | COMPLETE | Scale/accessibility regression coverage can grow | Medium | Reuse unchanged |
| Consent | Search/detail/self-service evidence paths | COMPLETE | Continue retention/privacy regression tests | Medium | Reuse unchanged |
| DSR | Intake, queue, assignment, transitions, page/filter | COMPLETE | Observability/E2E depth | Medium | Reuse patterns for CRM hardening |
| PQR | Intake, queue, assignment, transitions, page/filter | COMPLETE | Observability/E2E depth | Medium | Reuse patterns for CRM hardening |
| Reports | Definitions, filters, durable exports and UI | COMPLETE | CRM report depth and ownership filtering | Medium | Extend definitions, not reporting infrastructure |
| Observability | Request/correlation IDs, structured HTTP completion/error logs | HARDENING_REQUIRED | No CRM-specific operational metrics; audit gaps | Medium | Reuse logger/request context; add low-cardinality events only if needed |
| Accessibility/responsive | Shared accessible UI primitives and responsive admin layouts | HARDENING_REQUIRED | CRM dense board/table keyboard/mobile E2E coverage is limited | Medium | Test and refine existing pages |
| E2E | Global routes/admin access plus company creation | PARTIAL | No end-to-end lead→opportunity→activity→proposal→agreement path | High | Add isolated CRM E2E after API hardening |
| AI tool layer | None | MISSING | No tool schemas/registry/governance envelope | High | Define contracts over services; never SQL |
| Migrations/deploy | 40 ordered Prisma migrations; clean-install/seed checks | HARDENING_REQUIRED | CI script hard-codes migration count; every additive migration must update it | Medium | Add migrations atomically and update migration contract |

## Evidence map

- Data model: `apps/api/prisma/schema.prisma`, migrations `20260805054149`, `20260805055808`, `20260805060408`, `20260805194304`.
- Backend: `apps/api/src/modules/crm`, `companies`, `partners`, `audit`, `legal-documents`, `consent`, `data-subject-requests`, `pqr-cases`, `reports`.
- RBAC: `apps/api/src/database/rbac-catalog.ts`.
- Frontend: `apps/web/src/pages/admin/crm`, `apps/web/src/lib/admin/admin-crm-api.ts`, `admin-crm-types.ts`, `query-keys.ts`, `routes/router.tsx`.
- Quality: CRM/company/partner API integration specs, CRM component tests, `e2e/admin-companies.spec.ts`, `scripts/ci-check.sh`, `scripts/ci-verify.sh`, `scripts/ci-database-check.sh`.

## Automatic implementation boundary

Proceed without inventing business taxonomies: add backward-compatible server-side query maturity, transactional audit coverage, negative/concurrency tests, and governed AI contract definitions. Defer multi-site rules, partner's missing nine-state taxonomy, and a tenant model until business/architecture authority supplies the missing rules.
