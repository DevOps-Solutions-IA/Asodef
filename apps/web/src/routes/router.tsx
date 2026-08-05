import { lazy } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { PublicLayout } from "../layouts/PublicLayout";
import { AuthLayout } from "../layouts/AuthLayout";
import { RouteErrorBoundary } from "../layouts/shared/RouteErrorBoundary";
import { NotFoundPage } from "../pages/errors/NotFoundPage";
import { RoutePlaceholder } from "../pages/RoutePlaceholder";
import { HomePage } from "../pages/home/HomePage";
import { LoginPage } from "../pages/auth/LoginPage";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { GuestOnlyRoute } from "../lib/auth/route-guards/GuestOnlyRoute";
import { AuthenticatedRoute } from "../lib/auth/route-guards/AuthenticatedRoute";
import { RoleRoute } from "../lib/auth/route-guards/RoleRoute";
import { PermissionRoute } from "../lib/auth/route-guards/PermissionRoute";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { UserListPage } from "../pages/admin/UserListPage";
import { CreateUserPage } from "../pages/admin/CreateUserPage";
import { UserDetailPage } from "../pages/admin/UserDetailPage";
import { EditUserPage } from "../pages/admin/EditUserPage";
import { UserRolesPage } from "../pages/admin/UserRolesPage";
import { UserSessionsPage } from "../pages/admin/UserSessionsPage";
import { UserSecurityPage } from "../pages/admin/UserSecurityPage";
import { CrmLayout } from "../pages/admin/crm/CrmLayout";
import { ProspectsListPage } from "../pages/admin/crm/ProspectsListPage";
import { OpportunitiesBoardPage } from "../pages/admin/crm/OpportunitiesBoardPage";
import { OpportunityDetailPage } from "../pages/admin/crm/OpportunityDetailPage";
import { CrmCompaniesPage } from "../pages/admin/crm/CrmCompaniesPage";
import { CompanyDetailPage } from "../pages/admin/crm/CompanyDetailPage";
import { BusinessPartnerDetailPage } from "../pages/admin/crm/BusinessPartnerDetailPage";
import { AdminLegalPage } from "../pages/admin/legal/AdminLegalPage";
import { ConsentSearchPage } from "../pages/admin/legal/ConsentSearchPage";
import { DataSubjectRequestQueuePage } from "../pages/admin/legal/DataSubjectRequestQueuePage";
import { PqrQueuePage } from "../pages/admin/legal/PqrQueuePage";
import { AdminPaymentsPage } from "../pages/admin/payments/AdminPaymentsPage";
import { PaymentOrderDetailPage } from "../pages/admin/payments/PaymentOrderDetailPage";
import { AdminReconciliationPage } from "../pages/admin/payments/AdminReconciliationPage";
import { AdminReportsPage } from "../pages/admin/reports/AdminReportsPage";
import { PaymentLookupPage } from "../pages/payments/PaymentLookupPage";
import { OrderSummaryPage } from "../pages/payments/OrderSummaryPage";
import { PaymentProcessPage } from "../pages/payments/PaymentProcessPage";
import { PaymentResultPage } from "../pages/payments/PaymentResultPage";
import { ReceiptViewPage } from "../pages/payments/ReceiptViewPage";
import { LegalCenterPage } from "../pages/legal/LegalCenterPage";
import { LegalDocumentPage } from "../pages/legal/LegalDocumentPage";
import { DataSubjectRequestPage } from "../pages/legal/DataSubjectRequestPage";
import { PqrCasePage } from "../pages/legal/PqrCasePage";
import { LEGAL_CATALOG } from "../lib/legal/legal-catalog";

// US-048: solicitudes-de-datos is a real submission workflow, not a
// LegalDocument - it never gets the generic LegalDocumentPage treatment
// the other /legal/* subpages get (US-045 deliberately left it as
// "aún no publicado" until this story built the real thing).
const DATA_SUBJECT_REQUEST_SLUG = "solicitudes-de-datos";
// US-050: pqr is a real submission workflow too - its own literal AC
// names "/legal/pqr public form posts to POST /api/v1/pqr-cases",
// replacing the generic LegalDocumentPage treatment for this one route.
const PQR_SLUG = "pqr";
const SPECIAL_CASED_LEGAL_SLUGS = new Set([DATA_SUBJECT_REQUEST_SLUG, PQR_SLUG]);

// Payment/account/company/admin/legal are never needed on first paint of
// the public marketing site, so they're code-split - satisfies "no
// unnecessary eager loading of admin or payment modules". Public/Auth stay
// eager: Public is the landing experience itself, and Auth is tiny.
const PaymentLayout = lazy(() => import("../layouts/PaymentLayout").then((m) => ({ default: m.PaymentLayout })));
const AccountLayout = lazy(() => import("../layouts/AccountLayout").then((m) => ({ default: m.AccountLayout })));
const CompanyLayout = lazy(() => import("../layouts/CompanyLayout").then((m) => ({ default: m.CompanyLayout })));
const AdminLayout = lazy(() => import("../layouts/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const LegalLayout = lazy(() => import("../layouts/LegalLayout").then((m) => ({ default: m.LegalLayout })));

/**
 * Exported separately (not just the built router) so tests can build a
 * createMemoryRouter from the exact same route tree instead of duplicating
 * it - see router.test.tsx.
 */
export const routeConfig: RouteObject[] = [
  {
    path: "/",
    element: <PublicLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "quienes-somos", element: <RoutePlaceholder title="Quiénes somos" /> },
      { path: "beneficios", element: <RoutePlaceholder title="Beneficios" /> },
      { path: "portafolio", element: <RoutePlaceholder title="Portafolio" /> },
      { path: "cobertura", element: <RoutePlaceholder title="Cobertura" /> },
      { path: "empresas", element: <RoutePlaceholder title="Empresas" /> },
      { path: "contacto", element: <RoutePlaceholder title="Contacto" /> },
      // Global catch-all: React Router ranks routes by specificity across
      // the whole tree, so this only matches when nothing more specific
      // (admin/, mi-cuenta/, empresa/, legal/, pagos/, auth routes) does.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        // An already-authenticated visitor is sent to their real landing
        // area instead of seeing these forms again (US-010 section 6).
        element: <GuestOnlyRoute />,
        children: [
          { path: "iniciar-sesion", element: <LoginPage /> },
          { path: "recuperar-clave", element: <ForgotPasswordPage /> },
          { path: "restablecer-clave", element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <PaymentLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "pagos", element: <PaymentLookupPage /> },
      { path: "pagos/consultar", element: <RoutePlaceholder title="Consultar pago" /> },
      { path: "pagos/orden/:publicReference", element: <OrderSummaryPage /> },
      { path: "pagos/procesar/:publicReference", element: <PaymentProcessPage /> },
      { path: "pagos/resultado", element: <PaymentResultPage /> },
      { path: "pagos/comprobante/:publicReference", element: <ReceiptViewPage /> },
    ],
  },
  {
    // Authentication is required for every /mi-cuenta/* route - no role
    // restriction beyond "logged in" (US-010 recommended role routing:
    // CUSTOMER/AFFILIATE land here, but any authenticated user may view
    // their own account area).
    element: <AuthenticatedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "mi-cuenta",
        element: <AccountLayout />,
        children: [
          { index: true, element: <RoutePlaceholder title="Mi cuenta" /> },
          { path: "perfil", element: <RoutePlaceholder title="Perfil" /> },
          { path: "pagos", element: <RoutePlaceholder title="Mis pagos" /> },
          { path: "documentos", element: <RoutePlaceholder title="Documentos" /> },
          { path: "contratos", element: <RoutePlaceholder title="Contratos" /> },
          { path: "notificaciones", element: <RoutePlaceholder title="Notificaciones" /> },
        ],
      },
    ],
  },
  {
    element: <AuthenticatedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        // Only COMPANY_PARTNER may reach /empresa/* - an authenticated
        // user of any other role sees ForbiddenPage in place, never a
        // silent redirect that would hide the route's existence
        // inconsistently with how the backend responds (US-010 section 8).
        element: <RoleRoute roles={["COMPANY_PARTNER"]} />,
        children: [
          {
            path: "empresa",
            element: <CompanyLayout />,
            children: [
              { index: true, element: <RoutePlaceholder title="Panel de empresa" /> },
              { path: "dashboard", element: <RoutePlaceholder title="Dashboard" /> },
              { path: "beneficios", element: <RoutePlaceholder title="Beneficios" /> },
              { path: "contratos", element: <RoutePlaceholder title="Contratos" /> },
              { path: "reportes", element: <RoutePlaceholder title="Reportes" /> },
            ],
          },
        ],
      },
    ],
  },
  {
    element: <AuthenticatedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        // Outer gate (US-060): any internal-staff role may reach /admin/*.
        // External/self-service roles (COMPANY_PARTNER, AFFILIATE, CUSTOMER)
        // hold overlapping permission keys (e.g. payments.read) for their
        // OWN self-service views only, and must stay blocked here even
        // though they'd otherwise pass a bare permission check. Each
        // section below adds its own PermissionRoute for the specific
        // capability it requires.
        element: <RoleRoute roles={["SUPER_ADMIN", "ADMIN", "FINANCE", "COMMERCIAL", "CUSTOMER_SERVICE", "AUDITOR"]} />,
        children: [
          {
            path: "admin",
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              {
                // crm.read gates visibility (same pattern as every other
                // section here, e.g. payments.read/Pagos); crm.manage
                // gates mutation on top of that. AC5's "a user without
                // crm.manage sees the CRM screens in read-only mode... not
                // hidden" describes exactly this two-tier split, same as
                // payments.read+payments.reconcile for Pagos/Conciliación
                // - it does not mean CRM is visible to literally everyone.
                // CrmLayout disables mutating actions per-page for anyone
                // who reaches here without crm.manage. The "Empresas y
                // aliados" nav item (AdminLayout.tsx) also points here, at
                // its "empresas" sub-route - there is no separate
                // standalone empresas-y-aliados page.
                element: <PermissionRoute permissions={["crm.read"]} />,
                children: [
                  {
                    path: "crm",
                    element: <CrmLayout />,
                    children: [
                      { index: true, element: <Navigate to="prospectos" replace /> },
                      { path: "prospectos", element: <ProspectsListPage /> },
                      { path: "oportunidades", element: <OpportunitiesBoardPage /> },
                      { path: "oportunidades/:opportunityId", element: <OpportunityDetailPage /> },
                      { path: "empresas", element: <CrmCompaniesPage /> },
                      { path: "empresas/:companyId", element: <CompanyDetailPage /> },
                      { path: "aliados/:partnerId", element: <BusinessPartnerDetailPage /> },
                    ],
                  },
                ],
              },
              { path: "planes", element: <RoutePlaceholder title="Planes" /> },
              {
                element: <PermissionRoute permissions={["payments.read"]} />,
                children: [
                  { path: "pagos", element: <AdminPaymentsPage /> },
                  { path: "pagos/:orderId", element: <PaymentOrderDetailPage /> },
                ],
              },
              {
                element: <PermissionRoute permissions={["payments.reconcile"]} />,
                children: [{ path: "conciliacion", element: <AdminReconciliationPage /> }],
              },
              {
                element: <PermissionRoute permissions={["contracts.read"]} />,
                children: [{ path: "contratos", element: <RoutePlaceholder title="Contratos" /> }],
              },
              {
                // content.manage gates visibility (edit/submit/reject);
                // legal.approve additionally gates approve/publish inside
                // the page (AdminLegalPage's own hasPermission checks) -
                // same read-vs-manage split as every other section here.
                // Only ADMIN/SUPER_ADMIN currently hold content.manage.
                element: <PermissionRoute permissions={["content.manage"]} />,
                children: [{ path: "legal", element: <AdminLegalPage /> }],
              },
              {
                element: <PermissionRoute permissions={["data.manage"]} />,
                children: [{ path: "consentimientos", element: <ConsentSearchPage /> }],
              },
              {
                element: <PermissionRoute permissions={["data.manage"]} />,
                children: [{ path: "solicitudes-de-datos", element: <DataSubjectRequestQueuePage /> }],
              },
              {
                element: <PermissionRoute permissions={["pqr.manage"]} />,
                children: [{ path: "pqr", element: <PqrQueuePage /> }],
              },
              {
                element: <PermissionRoute permissions={["approvals.manage"]} />,
                children: [{ path: "aprobaciones", element: <RoutePlaceholder title="Aprobaciones" /> }],
              },
              {
                element: <PermissionRoute permissions={["reports.read"]} />,
                children: [{ path: "reportes", element: <AdminReportsPage /> }],
              },
              {
                element: <PermissionRoute permissions={["audit.read"]} />,
                children: [{ path: "auditoria", element: <RoutePlaceholder title="Auditoría" /> }],
              },
              {
                path: "usuarios",
                children: [
                  {
                    // users.read gates the list/detail read views. US-060's
                    // AC Example prose says "/admin/usuarios (requires
                    // users.manage)", but this gate predates US-060 (built
                    // and tested under an earlier user-management story)
                    // and every role that currently holds users.manage also
                    // holds users.read (ADMIN/SUPER_ADMIN only) - no seeded
                    // role is affected either way. Per the standing "do not
                    // modify completed auth/RBAC work absent a verified
                    // regression" instruction, left as users.read; flagging
                    // the AC-prose/implementation naming mismatch here
                    // instead of silently changing a working, tested gate.
                    element: <PermissionRoute permissions={["users.read"]} />,
                    children: [
                      { index: true, element: <UserListPage /> },
                      { path: ":userId", element: <UserDetailPage /> },
                    ],
                  },
                  {
                    element: <PermissionRoute permissions={["users.create"]} />,
                    children: [{ path: "nuevo", element: <CreateUserPage /> }],
                  },
                  {
                    element: <PermissionRoute permissions={["users.update"]} />,
                    children: [{ path: ":userId/editar", element: <EditUserPage /> }],
                  },
                  {
                    // users.roles.manage is SUPER_ADMIN-only in the seeded
                    // matrix (RoleAssignmentService itself also enforces
                    // this - the backend remains authoritative either way).
                    element: <PermissionRoute permissions={["users.roles.manage"]} />,
                    children: [{ path: ":userId/roles", element: <UserRolesPage /> }],
                  },
                  {
                    element: <PermissionRoute permissions={["users.sessions.read"]} />,
                    children: [{ path: ":userId/sesiones", element: <UserSessionsPage /> }],
                  },
                  {
                    element: <PermissionRoute permissions={["users.security.read"]} />,
                    children: [{ path: ":userId/seguridad", element: <UserSecurityPage /> }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "legal",
    element: <LegalLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <LegalCenterPage /> },
      ...LEGAL_CATALOG.filter((entry) => !SPECIAL_CASED_LEGAL_SLUGS.has(entry.slug)).map((entry) => ({
        path: entry.slug,
        element: <LegalDocumentPage slug={entry.slug} title={entry.title} />,
      })),
      { path: DATA_SUBJECT_REQUEST_SLUG, element: <DataSubjectRequestPage /> },
      { path: PQR_SLUG, element: <PqrCasePage /> },
    ],
  },
  // Alias: the master route map defines the canonical location as
  // /legal/pqr, but /pqr is also specified as a direct entry point.
  { path: "pqr", element: <Navigate to="/legal/pqr" replace /> },
];

// Opt into React Router v7's behavior now (still on v6) so this codebase
// doesn't accumulate deprecation debt before the next major upgrade.
// Note: v7_startTransition is a *render*-level flag read by RouterProvider
// itself (passed as its own `future` prop in App.tsx/router.test.tsx), not
// by createBrowserRouter/createMemoryRouter - the flags below are the
// router/data-level ones.
export const routerFutureConfig = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export const router = createBrowserRouter(routeConfig, { future: routerFutureConfig });
