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
import { LEGAL_CATALOG } from "../lib/legal/legal-catalog";
import { LegalCenterPage } from "../pages/legal/LegalCenterPage";
import { LegalDocumentPage } from "../pages/legal/LegalDocumentPage";
import { PqrCasePage as LegacyPqrCasePage } from "../pages/legal/LegacyPqrCasePage";
import { DataSubjectRequestPage as LegacyDataSubjectRequestPage } from "../pages/legal/LegacyDataSubjectRequestPage";
import { PreserveRedirect } from "./PreserveRedirect";
import { affiliateSelfServiceRoute, companySelfServiceRoute } from "./self-service-routes";

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
const AdminLayout = lazy(() => import("../layouts/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const LegalLayout = lazy(() => import("../layouts/LegalLayout").then((m) => ({ default: m.LegalLayout })));

// Route-level feature splitting keeps first paint focused on Home. These
// components retain their existing route objects and Suspense fallback, so
// navigation semantics stay stable while infrequently used features move to
// independent chunks.
const AboutPage = lazy(() => import("../pages/public/AboutPage").then((m) => ({ default: m.AboutPage })));
const BenefitsPage = lazy(() => import("../pages/public/BenefitsPage").then((m) => ({ default: m.BenefitsPage })));
const BenefitDetailPage = lazy(() => import("../pages/public/BenefitDetailPage").then((m) => ({ default: m.BenefitDetailPage })));
const SolutionsPage = lazy(() => import("../pages/public/SolutionsPage").then((m) => ({ default: m.SolutionsPage })));
const AudiencePage = lazy(() => import("../pages/public/SolutionsPage").then((m) => ({ default: m.AudiencePage })));
const CompaniesPage = lazy(() => import("../pages/public/SolutionsPage").then((m) => ({ default: m.CompaniesPage })));
const ResourcesPage = lazy(() => import("../pages/public/ResourcesPage").then((m) => ({ default: m.ResourcesPage })));
const FaqPage = lazy(() => import("../pages/public/ResourcesPage").then((m) => ({ default: m.FaqPage })));
const ContactPage = lazy(() => import("../pages/public/ContactPage").then((m) => ({ default: m.ContactPage })));
const GuidedStartPage = lazy(() => import("../pages/public/GuidedStartPage").then((m) => ({ default: m.GuidedStartPage })));
const PqrCasePage = lazy(() => import("../pages/legal/PqrCasePage").then((m) => ({ default: m.PqrCasePage })));
const DataSubjectRequestPage = lazy(() => import("../pages/legal/DataSubjectRequestPage").then((m) => ({ default: m.DataSubjectRequestPage })));

// Frozen /legal special-case routes render byte-for-byte baseline components;
// the canonical public workflows can evolve without changing Legal Center.
const PaymentLookupPage = lazy(() => import("../pages/payments/PaymentLookupPage").then((m) => ({ default: m.PaymentLookupPage })));
const OrderSummaryPage = lazy(() => import("../pages/payments/OrderSummaryPage").then((m) => ({ default: m.OrderSummaryPage })));
const PaymentProcessPage = lazy(() => import("../pages/payments/PaymentProcessPage").then((m) => ({ default: m.PaymentProcessPage })));
const PaymentResultPage = lazy(() => import("../pages/payments/PaymentResultPage").then((m) => ({ default: m.PaymentResultPage })));
const ReceiptViewPage = lazy(() => import("../pages/payments/ReceiptViewPage").then((m) => ({ default: m.ReceiptViewPage })));

const AdminDashboardPage = lazy(() => import("../pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
const UserListPage = lazy(() => import("../pages/admin/UserListPage").then((m) => ({ default: m.UserListPage })));
const CreateUserPage = lazy(() => import("../pages/admin/CreateUserPage").then((m) => ({ default: m.CreateUserPage })));
const UserDetailPage = lazy(() => import("../pages/admin/UserDetailPage").then((m) => ({ default: m.UserDetailPage })));
const EditUserPage = lazy(() => import("../pages/admin/EditUserPage").then((m) => ({ default: m.EditUserPage })));
const UserRolesPage = lazy(() => import("../pages/admin/UserRolesPage").then((m) => ({ default: m.UserRolesPage })));
const UserSessionsPage = lazy(() => import("../pages/admin/UserSessionsPage").then((m) => ({ default: m.UserSessionsPage })));
const UserSecurityPage = lazy(() => import("../pages/admin/UserSecurityPage").then((m) => ({ default: m.UserSecurityPage })));
const CurrentAdminSessionsPage = lazy(() => import("../pages/admin/CurrentAdminSessionsPage").then((m) => ({ default: m.CurrentAdminSessionsPage })));
const CurrentAdminSecurityPage = lazy(() => import("../pages/admin/CurrentAdminSecurityPage").then((m) => ({ default: m.CurrentAdminSecurityPage })));
const AdminSystemPage = lazy(() => import("../pages/admin/AdminSystemPage").then((m) => ({ default: m.AdminSystemPage })));
const AdminAuditPage = lazy(() => import("../pages/admin/AdminAuditPage").then((m) => ({ default: m.AdminAuditPage })));
const CrmLayout = lazy(() => import("../pages/admin/crm/CrmLayout").then((m) => ({ default: m.CrmLayout })));
const ProspectsListPage = lazy(() => import("../pages/admin/crm/ProspectsListPage").then((m) => ({ default: m.ProspectsListPage })));
const OpportunitiesBoardPage = lazy(() => import("../pages/admin/crm/OpportunitiesBoardPage").then((m) => ({ default: m.OpportunitiesBoardPage })));
const OpportunityDetailPage = lazy(() => import("../pages/admin/crm/OpportunityDetailPage").then((m) => ({ default: m.OpportunityDetailPage })));
const CrmCompaniesPage = lazy(() => import("../pages/admin/crm/CrmCompaniesPage").then((m) => ({ default: m.CrmCompaniesPage })));
const CompanyDetailPage = lazy(() => import("../pages/admin/crm/CompanyDetailPage").then((m) => ({ default: m.CompanyDetailPage })));
const BusinessPartnerDetailPage = lazy(() => import("../pages/admin/crm/BusinessPartnerDetailPage").then((m) => ({ default: m.BusinessPartnerDetailPage })));
const AdminLegalPage = lazy(() => import("../pages/admin/legal/AdminLegalPage").then((m) => ({ default: m.AdminLegalPage })));
const ConsentSearchPage = lazy(() => import("../pages/admin/legal/ConsentSearchPage").then((m) => ({ default: m.ConsentSearchPage })));
const DataSubjectRequestQueuePage = lazy(() => import("../pages/admin/legal/DataSubjectRequestQueuePage").then((m) => ({ default: m.DataSubjectRequestQueuePage })));
const PqrQueuePage = lazy(() => import("../pages/admin/legal/PqrQueuePage").then((m) => ({ default: m.PqrQueuePage })));
const AdminPaymentsPage = lazy(() => import("../pages/admin/payments/AdminPaymentsPage").then((m) => ({ default: m.AdminPaymentsPage })));
const PaymentOrderDetailPage = lazy(() => import("../pages/admin/payments/PaymentOrderDetailPage").then((m) => ({ default: m.PaymentOrderDetailPage })));
const AdminReconciliationPage = lazy(() => import("../pages/admin/payments/AdminReconciliationPage").then((m) => ({ default: m.AdminReconciliationPage })));
const AdminReportsPage = lazy(() => import("../pages/admin/reports/AdminReportsPage").then((m) => ({ default: m.AdminReportsPage })));
const PlansAdminPage = lazy(() => import("../pages/admin/control-plane/PlansAdminPage").then((m) => ({ default: m.PlansAdminPage })));
const ControlPlaneSectionPage = lazy(() => import("../pages/admin/control-plane/ControlPlaneSectionPage").then((m) => ({ default: m.ControlPlaneSectionPage })));
const KoralHumanInboxPage = lazy(() => import("../features/koral-inbox/KoralHumanInboxPage").then((m) => ({ default: m.KoralHumanInboxPage })));
const KnowledgeAdminPage = lazy(() => import("../features/knowledge/KnowledgeAdminPage").then((m) => ({ default: m.KnowledgeAdminPage })));

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
      { path: "quienes-somos", element: <AboutPage /> },
      { path: "beneficios", element: <BenefitsPage /> },
      { path: "beneficios/:slug", element: <BenefitDetailPage /> },
      { path: "plan-exequial-familiar", element: <PreserveRedirect to="/beneficios/plan-exequial-familiar" /> },
      { path: "soluciones", element: <SolutionsPage /> },
      { path: "soluciones/:audience", element: <AudiencePage /> },
      { path: "empresas", element: <CompaniesPage /> },
      { path: "recursos", element: <ResourcesPage /> },
      { path: "recursos/preguntas-frecuentes", element: <FaqPage /> },
      { path: "contacto", element: <ContactPage /> },
      { path: "comenzar", element: <GuidedStartPage /> },
      { path: "pqr", element: <PqrCasePage /> },
      { path: "solicitudes-de-datos", element: <DataSubjectRequestPage /> },
      { path: "portafolio", element: <PreserveRedirect to="/beneficios" /> },
      { path: "cobertura", element: <PreserveRedirect to="/quienes-somos#operacion" /> },
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
          { path: "login", element: <Navigate to="/iniciar-sesion" replace /> },
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
  affiliateSelfServiceRoute,
  companySelfServiceRoute,
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
                element: <PermissionRoute permissions={["plans.read"]} />,
                children: [{ path: "planes", element: <PlansAdminPage /> }],
              },
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
              {
                // Agent 1's canonical conversation contract owns these
                // read permissions. Mutation permissions remain enforced by
                // its API and are never inferred from this UI route.
                element: <PermissionRoute permissions={["koral.conversations.read"]} />,
                children: [
                  { path: "koral/conversaciones", element: <ControlPlaneSectionPage area="koral" section="conversaciones" /> },
                  { path: "koral/inbox", element: <KoralHumanInboxPage /> },
                ],
              },
              {
                element: <PermissionRoute permissions={["knowledge.read"]} />,
                children: [{ path: "koral/conocimiento", element: <KnowledgeAdminPage /> }],
              },
              {
                // Foundation routes intentionally reuse the existing
                // platform-governance permission. Fine-grained backend
                // permissions remain a documented dependency and are not
                // inferred by the frontend.
                element: <PermissionRoute permissions={["settings.manage"]} />,
                children: [
                  { path: "koral/:sectionSlug", element: <ControlPlaneSectionPage area="koral" /> },
                  { path: "koral", element: <Navigate to="/admin/koral/resumen" replace /> },
                  { path: "comunicaciones/:sectionSlug", element: <ControlPlaneSectionPage area="comunicaciones" /> },
                  { path: "comunicaciones", element: <Navigate to="/admin/comunicaciones/plantillas" replace /> },
                ],
              },
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
                element: <PermissionRoute permissions={["users.sessions.read"]} />,
                children: [
                  { path: "mi-cuenta/sesiones", element: <CurrentAdminSessionsPage /> },
                  { path: "sesiones", element: <Navigate to="/admin/mi-cuenta/sesiones" replace /> },
                ],
              },
              {
                element: <PermissionRoute permissions={["users.security.read"]} />,
                children: [
                  { path: "mi-cuenta", element: <Navigate to="/admin/mi-cuenta/seguridad" replace /> },
                  { path: "mi-cuenta/seguridad", element: <CurrentAdminSecurityPage /> },
                  { path: "seguridad", element: <Navigate to="/admin/mi-cuenta/seguridad" replace /> },
                ],
              },
              {
                element: <PermissionRoute permissions={["settings.manage"]} />,
                children: [{ path: "sistema", element: <AdminSystemPage /> }],
              },
              {
                element: <PermissionRoute permissions={["audit.read"]} />,
                children: [{ path: "auditoria", element: <AdminAuditPage /> }],
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
      { path: DATA_SUBJECT_REQUEST_SLUG, element: <LegacyDataSubjectRequestPage /> },
      { path: PQR_SLUG, element: <LegacyPqrCasePage /> },
    ],
  },
];

// Keep the previously adopted data-router behavior explicit. React Router 7
// made transition scheduling the default and removed RouterProvider's former
// v7_startTransition compatibility prop.
export const routerFutureConfig = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export const router = createBrowserRouter(routeConfig, { future: routerFutureConfig });
