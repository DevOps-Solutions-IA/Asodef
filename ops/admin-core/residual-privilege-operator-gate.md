# Residual privileged identity operator gate

## Verified condition

Production currently has one inactive non-official user with one
`SUPER_ADMIN` assignment (sanitized alias `a429549833a6`). The official active
account has its own `SUPER_ADMIN` assignment and the recovery-only address has
no login-capable `User` row.

The target state is:

- official active privileged identities: exactly one;
- official `SUPER_ADMIN` assignments: exactly one;
- recovery-only login identities: zero;
- all other `ADMIN` or `SUPER_ADMIN` assignments: zero.

Do not delete or reactivate the residual user. Remove only its `SUPER_ADMIN`
assignment.

## Existing supported path

The deployed release exposes the existing protected UI at
`/admin/usuarios/:userId/roles` and the API operation
`POST /api/v1/admin/users/:userId/roles/revoke`. It requires the official
`SUPER_ADMIN`, the `users.roles.manage` permission and a non-empty reason. A
preview request (`preview=true`) performs no mutation. The applied operation
records `ROLE_REMOVED` with actor, target, role and reason.

The deployed implementation predates Phase 1's final hardening: the role
delete and `ROLE_REMOVED` insert are not in the same transaction, the event is
best-effort, and the controller does not attach the new request/correlation
context. The new release fixes all three points, but its startup invariant
correctly fails closed while any non-official privileged assignment remains.

## Gate decision

This creates a one-time bootstrap incompatibility. There is no safe way to use
the hardened API before satisfying the invariant without weakening that
invariant, adding a bypass, or performing a direct database mutation. All are
prohibited.

Therefore the release is:

`RESIDUAL_PRIVILEGE_CLEANUP=REQUIRES_OPERATOR_DECISION`

It is also reported as `SUPER_ADMIN_HUMAN_GATE_REQUIRED=YES`. Automation must
stop here: it may show the route, preview contract and sanitized aggregate
expectations, but must never request or capture a password, cookie, MFA secret
or TOTP code.

The bounded existing-path option is:

1. create and custody-verify a pre-change encrypted backup;
2. authenticate as the official administrator in the currently deployed UI;
3. identify the inactive target through the authorized user-management view;
4. preview revocation of only `SUPER_ADMIN` with an approved operational
   reason;
5. apply that single revocation through the UI/API;
6. verify the role is absent and a durable `ROLE_REMOVED` event exists;
7. verify the four target-state counts above;
8. create and custody-verify a post-change encrypted backup;
9. run the isolated 34-to-40 migration rehearsal from the post-change backup.

Approval of this option explicitly accepts the deployed release's documented
non-transactional audit limitation for this one reconciliation. If that is not
acceptable, stop. A new, separately reviewed release mechanism is required;
do not improvise a maintenance endpoint or disable the invariant.

Never place session cookies, CSRF values, passwords, email addresses, user IDs
or response bodies in the operator ledger. Record only the sanitized alias,
role, result, event presence, request timestamp and aggregate invariant counts.
