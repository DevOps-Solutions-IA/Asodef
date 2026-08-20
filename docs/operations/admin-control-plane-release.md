# Single-admin control plane — release and recovery runbook

Status: release procedure for the additive administrative-security changes.
This document contains variable names and bounded checks only; it must never
contain secret values, reset links, MFA seeds, recovery codes or SMTP content.

## Invariants

- The only identity allowed to hold `ADMIN` or `SUPER_ADMIN` is the configured
  `ADMIN_ACCOUNT_EMAIL` (`admin@asodef.com.co`).
- `ADMIN_RECOVERY_EMAIL` (`asodefsas@gmail.com`) is delivery-only and must not
  exist as a login-capable `User` row.
- The official account must be `ACTIVE`, have its exact `recoveryEmail`, and
  retain `ADMIN` or `SUPER_ADMIN`.
- Administrative authentication remains PostgreSQL/JWT/RBAC. Firebird never
  authenticates an administrator and remains read-only.
- `ADMIN_MFA_REQUIRED` must remain `false` until enrollment and recovery-code
  custody have been completed and independently verified.

The API validates these identity invariants at startup and fails closed. It
does not repair production data automatically.

## Required runtime configuration

Confirm presence without printing values:

- `ADMIN_ACCOUNT_EMAIL`
- `ADMIN_RECOVERY_EMAIL`
- `ADMIN_MFA_REQUIRED`
- `ADMIN_MFA_CHALLENGE_TTL_SECONDS`
- `ADMIN_MFA_ENROLLMENT_TTL_SECONDS`
- `ADMIN_STEP_UP_TTL_SECONDS`
- `ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS`
- `ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS`
- `ENCRYPTION_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM`

SMTP is a production prerequisite for certifying recovery. The safe no-op
transport is acceptable for development only and must never be reported as a
successful recovery channel.

## Pre-deploy inspection

Using read-only PostgreSQL queries or the approved operational inspection
tool, verify and record counts only:

1. exactly one active official account;
2. exact recovery-email match for that account;
3. zero `User` rows for the recovery-only address;
4. zero other users holding `ADMIN` or `SUPER_ADMIN`;
5. count of historical `NotificationJob` rows in `QUEUED` with no durable
   payload (these become reviewable dead letters after migration);
6. previous API image/release and rollback command;
7. protected WhatsApp stack container IDs/restart counts.

Abort before migration or deploy when any identity invariant differs.

## Compatible deployment sequence

1. Freeze an exact Git SHA and create a database backup using the established
   encrypted backup procedure.
2. Rehearse all migrations on an isolated restore. They are additive; do not
   edit an already-applied migration.
3. Apply migrations before starting the new API.
4. Deploy the new API with `ADMIN_MFA_REQUIRED=false` and the real SMTP
   configuration present. Recreate only the public API.
5. Verify API, PostgreSQL, Redis, Master and outbox status through
   `/api/v1/admin/sistema`; `UNKNOWN` is not a pass.
6. Log in as the official account, enroll TOTP under `/admin/seguridad`, verify
   it, and transfer the one-time recovery codes to approved offline custody.
   Do not capture the MFA seed or codes in tickets, logs or screenshots.
7. Log out and verify ordinary password login still works while enforcement
   remains off. Verify step-up using a fresh factor.
8. Perform a controlled password-recovery smoke through the official login
   address. Confirm the outbox reaches `SENT` and the message arrives only at
   the recovery address. Revoke/supersede the test reset token without
   changing the production password when possible.
9. Change only `ADMIN_MFA_REQUIRED=true`, recreate only the public API, then
   verify password login returns an MFA challenge and creates no cookies or
   session until the factor succeeds.
10. Verify session listing/revocation, audit timeline, system status and one
    step-up-protected no-op-safe operation.
11. Observe restart counts, error loops, outbox backlog and dependency health
    for the agreed stability window. Confirm the protected stack is unchanged.

## Abort and rollback

If enrollment, SMTP delivery, MFA login, step-up, invariant preflight or API
health fails:

1. set `ADMIN_MFA_REQUIRED=false` using the existing secret/env mechanism;
2. recreate only the public API at the same release;
3. if the API remains unhealthy, restore the previous API image/config and
   recreate only that API;
4. do not roll back additive database columns while the old API is running;
5. verify API health, auth, PostgreSQL, Redis, Master, payments and the
   protected stack;
6. preserve dead-letter/unknown-result jobs for operator review—do not delete
   or blindly resend them.

## Key and credential rotation

- Do not rotate `ENCRYPTION_KEY` in place. It protects both MFA credentials
  and durable notification payloads through domain-separated derived keys.
  A future rotation requires versioned ciphertext plus a tested re-encryption
  procedure and rollback.
- SMTP and JWT credentials may be rotated only through their established
  secret store with current/next overlap where supported and a rollback value.
- Reset-token and refresh-token peppers invalidate outstanding tokens when
  rotated; plan that user impact explicitly.
- TOTP revocation is allowed only while enforcement is off, after recent
  step-up and with the privileged recovery channel valid.

## Post-release evidence

Record only sanitized outcomes: release SHA, migration count, health states,
MFA required/enrolled booleans, session counts, outbox status counts, CI run,
rollback image and protected-stack unchanged result. Never record recipients,
tokens, hashes, MFA material, cookies or connection strings.

## Dependency and browser-security evidence

`scripts/ci-security-check.sh` blocks high or critical production dependency
advisories and always prints lower-severity findings for release review. At
the 2026-08-20 baseline, six moderate advisories remain and require explicit
reachability review on every release:

- React Router is used only as a client-side data router; ASODEF does not use
  React Server Components, server hydration deserialization, route actions or
  loader redirects. All caller-supplied return paths additionally pass through
  `isSafeInternalPath`, which rejects protocol-relative, backslash, encoded
  separator, malformed and overlong destinations.
- The reported Nest SSE path is not used by the API.
- The affected `file-type` ASF/ZIP parsing paths are not used to parse
  administrator-controlled uploads in this phase.

This is reachability evidence, not a permanent waiver. Any new use of those
code paths or a high/critical advisory blocks release until remediated. The
cookie-authenticated admin UI uses `SameSite=Strict`; the API also rejects an
explicit cross-site Fetch Metadata signal or a foreign `Origin`. Raw/legacy
clients without either browser signal remain a documented defense-in-depth
residual and do not receive a browser victim's Strict cookie cross-site.
