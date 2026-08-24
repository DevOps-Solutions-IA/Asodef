# Canonical Plans backend and migration audit

## Verified brownfield model and data policy

`Plan` was already the stable identity and `PlanVersion` the numbered
commercial snapshot. `Obligation.planId` points to the stable aggregate and
`PaymentOrder.planVersionAcceptedId` already pins the exact disclosed version.
`ContractVersion` previously had no plan reference. No Plans application API
existed. The public benefits page is editorial content, not a priced plan
catalog. Master/Firebird has a separate read-only projection and is not an
authoritative Plans source.

Legacy statuses (`UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`) and their
data are preserved exactly. There is no inferred `ACTIVE -> PUBLISHED` mapping,
no generated code, currency, visibility or effective date. Admin reports these
rows as `LEGACY_UNMAPPED`; public, Koral, CRM and Contracts reads fail closed.
Any business-approved backfill is a separate operational change.

## Canonical aggregate

`Plan` owns stable `id`, immutable unique business `code`, administrative
`name`, `currentVersionId` and creation time. `code` is nullable at database
level only to preserve existing rows; canonical create requires
`^[A-Z][A-Z0-9_]{2,63}$`.

`PlanVersion` owns all versioned commercial content:

| Contract concept | Canonical storage |
| --- | --- |
| Display name / description | `publicName`, `description` |
| Features | existing `included_services` JSONB, exposed as `features` |
| Benefits | additive `benefits` JSONB |
| Eligibility | `eligibility` |
| Pricing | `priceCents` minor units + additive ISO-4217 `currency` |
| Billing period | existing `billing_frequency`, exposed as `billingPeriod`; allowed `MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL`, `ONE_TIME` |
| Visibility | `publicVisibility`, `koralVisibility`, `crmVisibility`, `contractVisibility` |
| Publication | `status`, `reviewedAt`, `publishedAt`, `retiredAt`, existing start/end columns exposed as `effectiveFrom`/`effectiveTo` |
| Presentation | `commercialText`, `recommended`, `displayOrder` |
| Concurrency | monotonic `revision` |

Features and benefits use one explicit shape: an array of `{ code, name,
description? }` with stable unique uppercase codes. Existing coverage,
exclusions, beneficiary rules, taxes, terms, cancellation, renewal and payment
conditions remain intact.

## Lifecycle, permissions and atomicity

Canonical lifecycle is `DRAFT -> REVIEW -> PUBLISHED -> RETIRED`. Draft content
is editable only with the expected `revision`. Publication and retirement
require `plans.publish` plus step-up; draft authoring uses `plans.manage`; reads
use `plans.read` and Koral uses `koral.plans.read`. Every mutation requires an
`Idempotency-Key` and every lifecycle transition writes an audit record in the
same transaction.

Publication locks the parent Plan, retires (never deletes or edits) the prior
published version, publishes the reviewed target, and changes the sole
`currentVersionId` pointer atomically. A partial unique index independently
enforces at most one `PUBLISHED` row per Plan.

## One read source and immutable references

`PlansService.listPublished(audience)` is the one application read path.
`GET /plans` supplies the public site, `GET /koral/plans` supplies Koral, and
the same method supplies CRM/Contracts audiences. It returns only the current
`PUBLISHED`, visible and effective version. It never returns a legacy state.
Koral and recommendation logic therefore receive persisted plan names and
prices; an LLM cannot provide or override them.

`ContractVersion.planVersionId` and the existing
`PaymentOrder.planVersionAcceptedId` both use `ON DELETE RESTRICT` to pin exact
historical snapshots. A later publication only moves the Plan pointer and
retires the old version; it never mutates either reference or accepted content.
Existing ContractVersions remain null rather than receiving an invented
backfill. New contract versions may pin only a currently published, effective,
`contractVisibility=true` version.

## Migration and rollout

The two migrations are additive and bring the migration count from 44 to 46.
They add canonical fields, contract/audit foreign keys, enum values and the
publication uniqueness index. They contain no `UPDATE`, `DELETE`, table drop,
column drop, legacy status rewrite or generated business mapping. Production
execution is outside this mission.
