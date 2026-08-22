# Admin information architecture

## Brownfield decision matrix

| Current element        | Current route                                   | Current component/API                                | Permission                                        | Target location                     | Action                                                                        |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Dashboard              | `/admin`                                        | `AdminDashboardPage`, `GET /admin/dashboard`         | internal staff role                               | Gestión / Dashboard                 | REFACTOR: retain live business metrics and remove technical/account telemetry |
| CRM                    | `/admin/crm/*`                                  | Existing CRM layout, pages and controllers           | `crm.read`, mutations retain domain permissions   | Gestión / CRM                       | KEEP                                                                          |
| Companies and partners | `/admin/crm/empresas`, `/admin/crm/aliados/:id` | Existing CRM company/partner pages and APIs          | `crm.read`, `companies.manage`, `partners.manage` | Gestión / Empresas y aliados        | KEEP                                                                          |
| Plans                  | `/admin/planes`                                 | Route placeholder only                               | none                                              | Gestión / Planes                    | REMOVE_FROM_NAV until a real administrative page/API exists                   |
| Contracts              | `/admin/contratos`                              | Route placeholder; real contract backend exists      | `contracts.read`                                  | Gestión / Contratos                 | REMOVE_FROM_NAV until a real administrative page exists                       |
| Communications         | `/admin/comunicaciones`                         | Route placeholder; public unsubscribe/API exists     | none                                              | Operación / Comunicaciones          | REMOVE_FROM_NAV until an administrative workflow exists                       |
| Payments               | `/admin/pagos/*`                                | Existing payment pages and APIs                      | `payments.read`                                   | Operación / Pagos                   | KEEP                                                                          |
| Reconciliation         | `/admin/conciliacion`                           | Existing reconciliation page and APIs                | `payments.reconcile`                              | Operación / Conciliación            | KEEP                                                                          |
| Legal                  | `/admin/legal`                                  | Existing Legal admin module                          | `content.manage`, `legal.approve` for approval    | Cumplimiento / Legal                | KEEP, no functional modification                                              |
| Consents               | `/admin/consentimientos`                        | Existing consent search/API                          | `data.manage`                                     | Cumplimiento / Consentimientos      | KEEP                                                                          |
| Data subject requests  | `/admin/solicitudes-de-datos`                   | Existing queue/API                                   | `data.manage`                                     | Cumplimiento / Solicitudes de datos | KEEP                                                                          |
| PQR                    | `/admin/pqr`                                    | Existing queue/API                                   | `pqr.manage`                                      | Cumplimiento / PQR                  | KEEP                                                                          |
| Approvals              | `/admin/aprobaciones`                           | Route placeholder; real approval-gate API exists     | `approvals.manage`                                | Cumplimiento / Aprobaciones         | REMOVE_FROM_NAV until a real page exists                                      |
| Reports                | `/admin/reportes`                               | Existing reports page/API                            | `reports.read`                                    | Inteligencia / Reportes             | KEEP                                                                          |
| Users                  | `/admin/usuarios/*`                             | Existing user administration pages/APIs              | granular `users.*`                                | Administración / Usuarios           | KEEP                                                                          |
| Audit                  | `/admin/auditoria`                              | Existing audit page/API                              | `audit.read`                                      | Administración / Auditoría          | KEEP                                                                          |
| System status          | `/admin/sistema`                                | Existing system page/API                             | `settings.manage`                                 | Administración / Sistema            | REFACTOR into technical sections                                              |
| Personal security      | `/admin/seguridad`                              | Existing current-user facade over user security APIs | `users.security.read`                             | Actor menu / Mi cuenta              | MOVE; legacy URL redirects                                                    |
| Personal sessions      | `/admin/sesiones`                               | Existing current-user facade over session APIs       | `users.sessions.read` and revoke permission       | Actor menu / Mi cuenta              | MOVE; legacy URL redirects                                                    |

## Resulting taxonomy

- Gestión: Dashboard, CRM, Empresas y aliados.
- Operación: Pagos, Conciliación.
- Cumplimiento: Legal, Consentimientos, Solicitudes de datos, PQR.
- Inteligencia: Reportes.
- Administración: Usuarios, Auditoría, Sistema.
- Mi cuenta: identity entry point, password, MFA, sessions and logout in the header actor control.

Placeholder-only routes remain backward compatible but are not advertised as operational capabilities. Existing RBAC guards remain on every canonical and compatibility route.

## System health contract

The administrative system response distinguishes `HEALTHY`, `DEGRADED`, `UNAVAILABLE`, `UNKNOWN`, `NOT_CONFIGURED`, and `DISABLED`. API, PostgreSQL and Redis determine Admin Core availability. Master/Firebird, Bold and SMTP are integrations with explicit impact and criticality; they do not independently declare Admin Core down. Notification queue health and transport health are separate signals.

No direct production action, deploy control, secret, internal endpoint, or database credential is exposed by the UI or API response.
