# Plans canonical backend design — decision gate

This document audits the brownfield model and proposes its additive evolution.
It deliberately adds no Prisma migration, service, route or UI because the
required backfill and lifecycle mappings need an explicit architectural/data
decision.

## Current plan model

`Plan` is the stable aggregate (`id`, unique `name`, `currentVersionId`,
`createdAt`). `PlanVersion` already provides immutable numbered versions with
`internalName`, `publicName`, `description`, `coverage`, JSON
`includedServices`, JSON `exclusions`, `eligibility`, `beneficiaryRules`,
`priceCents`, `billingFrequency`, `taxes`, `startDate`, `endDate`, `terms`,
`cancellationRules`, `renewalRules` and `paymentConditions`.

The current lifecycle is `DRAFT`, `UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`,
`RETIRED`, `ARCHIVED`. Payment Orders retain `planVersionAcceptedId`, which is
important immutable disclosure evidence. Obligations point to the stable Plan.
There is no Plans application module/API; local payment seed and payment-order
disclosure are the only PostgreSQL consumers found. Master/Firebird exposes a
separate read-only external `Plan` projection and is not the Admin Core source.
Public benefit content is currently a curated static catalog, not this Prisma
aggregate.

## Field matrix

| Target             | Brownfield field                          | Assessment                                                                                                 |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `code`             | none                                      | Missing immutable unique business key.                                                                     |
| `name`             | `Plan.name`, `internalName`, `publicName` | Reusable data, conflicting semantics; choose canonical versioned display name and preserve internal label. |
| `description`      | `PlanVersion.description`                 | Reusable.                                                                                                  |
| `features`         | `includedServices` JSON                   | Partially reusable; schema and meaning must be normalized before rename/mapping.                           |
| `benefits`         | none                                      | Missing; unrelated Business Partner benefits must not be reused.                                           |
| `eligibility`      | `eligibility`                             | Reusable.                                                                                                  |
| `pricing`          | `priceCents`                              | Reusable minor-unit value; target API/DB naming and numeric semantics require decision.                    |
| `currency`         | none                                      | Missing ISO-4217 currency.                                                                                 |
| `billingPeriod`    | `billingFrequency`                        | Reusable after vocabulary contract.                                                                        |
| `commercialText`   | none                                      | Missing.                                                                                                   |
| `terms`            | `terms`                                   | Reusable.                                                                                                  |
| `status`           | `PlanVersionStatus`                       | Semantic conflict; current enum is not the approved lifecycle.                                             |
| `publicVisibility` | none                                      | Missing.                                                                                                   |
| `koralVisibility`  | none                                      | Missing.                                                                                                   |
| `recommended`      | none                                      | Missing.                                                                                                   |
| `displayOrder`     | none                                      | Missing.                                                                                                   |
| `effectiveFrom`    | `startDate`                               | Reusable.                                                                                                  |
| `effectiveTo`      | `endDate`                                 | Reusable.                                                                                                  |
| `version`          | `PlanVersion.version`                     | Reusable and database-unique per Plan.                                                                     |

Existing `coverage`, `exclusions`, `beneficiaryRules`, `taxes`, cancellation,
renewal and payment-condition fields remain valuable and must be preserved.

## Target single-source aggregate

- Keep one stable PostgreSQL `Plan` identity and the existing version history.
- Add immutable unique `Plan.code`; do not derive or backfill a business code
  from display text without approved source data.
- Put all mutable commercial content on `PlanVersion`, including the target
  fields and the valuable existing disclosure fields.
- Publish via a single current-published-version pointer. Admin authors draft
  versions; public pages, Koral, CRM and Contracts read that same published
  version through one Plans application service with channel visibility and
  RBAC/policy filters.
- Preserve `PaymentOrder.planVersionAcceptedId` and any future Contract version
  reference so historical acceptance never changes after a later publication.
- Treat Master/Firebird only as an optional integration/projection, never as a
  second canonical catalog.

Lifecycle target: `DRAFT -> REVIEW -> PUBLISHED -> RETIRED`. Only `PUBLISHED`
is consumable by public/Koral/CRM/contract creation, subject to its visibility
flags and effective dates.

## Migration decision

`MIGRATION_REQUIRED=YES`. Recommended type: additive columns plus controlled
data backfill and a staged enum transition; no replacement table and no
destructive rewrite. Migration implementation is blocked on these decisions:

1. approved `code` values/backfill for every existing Plan;
2. canonical source for `name` (`publicName` versus stable `Plan.name`) and
   treatment of `internalName`;
3. JSON schemas for `features` and `benefits`;
4. pricing storage/API shape and allowed billing-period vocabulary;
5. deterministic mappings for `ACTIVE -> PUBLISHED` and
   `UNDER_REVIEW -> REVIEW`, plus business disposition of `SUSPENDED` and
   `ARCHIVED` records;
6. initial public/Koral visibility and effective-date defaults.

Backward compatibility requires a transition adapter for existing payment
disclosure (`publicName`, `priceCents`, `billingFrequency`, `startDate`,
`endDate`) and continued acceptance of historical PlanVersion IDs until all
consumers move to the canonical read contract.
