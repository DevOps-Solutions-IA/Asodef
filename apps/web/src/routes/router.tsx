import { lazy } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { PublicLayout } from "../layouts/PublicLayout";
import { AuthLayout } from "../layouts/AuthLayout";
import { RouteErrorBoundary } from "../layouts/shared/RouteErrorBoundary";
import { NotFoundPage } from "../pages/errors/NotFoundPage";
import { RoutePlaceholder } from "../pages/RoutePlaceholder";

// Payment/account/company/admin/legal are never needed on first paint of
// the public marketing site, so they're code-split - satisfies "no
// unnecessary eager loading of admin or payment modules". Public/Auth stay
// eager: Public is the landing experience itself, and Auth is tiny.
const PaymentLayout = lazy(() => import("../layouts/PaymentLayout").then((m) => ({ default: m.PaymentLayout })));
const AccountLayout = lazy(() => import("../layouts/AccountLayout").then((m) => ({ default: m.AccountLayout })));
const CompanyLayout = lazy(() => import("../layouts/CompanyLayout").then((m) => ({ default: m.CompanyLayout })));
const AdminLayout = lazy(() => import("../layouts/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const LegalLayout = lazy(() => import("../layouts/LegalLayout").then((m) => ({ default: m.LegalLayout })));

const LEGAL_ROUTE_TITLES: Record<string, string> = {
  "": "Centro legal",
  "informacion-empresarial": "Información empresarial",
  "politica-de-privacidad": "Política de privacidad",
  "tratamiento-de-datos": "Tratamiento de datos",
  "aviso-de-privacidad": "Aviso de privacidad",
  "terminos-y-condiciones": "Términos y condiciones",
  "terminos-de-pago": "Términos de pago",
  "reversiones-y-reembolsos": "Reversiones y reembolsos",
  "politica-de-cookies": "Política de cookies",
  pqr: "PQR",
  seguridad: "Seguridad",
  accesibilidad: "Accesibilidad",
  "solicitudes-de-datos": "Solicitudes de datos",
};

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
      { index: true, element: <RoutePlaceholder title="Inicio" /> },
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
      { path: "iniciar-sesion", element: <RoutePlaceholder title="Iniciar sesión" /> },
      { path: "recuperar-clave", element: <RoutePlaceholder title="Recuperar clave" /> },
      { path: "restablecer-clave", element: <RoutePlaceholder title="Restablecer clave" /> },
    ],
  },
  {
    element: <PaymentLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "pagos", element: <RoutePlaceholder title="Centro de Pagos" /> },
      { path: "pagos/consultar", element: <RoutePlaceholder title="Consultar pago" /> },
      { path: "pagos/orden/:publicReference", element: <RoutePlaceholder title="Resumen de orden" /> },
      { path: "pagos/procesar/:publicReference", element: <RoutePlaceholder title="Procesar pago" /> },
      { path: "pagos/resultado", element: <RoutePlaceholder title="Resultado de pago" /> },
      { path: "pagos/comprobante/:publicReference", element: <RoutePlaceholder title="Comprobante" /> },
    ],
  },
  {
    path: "mi-cuenta",
    element: <AccountLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <RoutePlaceholder title="Mi cuenta" /> },
      { path: "perfil", element: <RoutePlaceholder title="Perfil" /> },
      { path: "pagos", element: <RoutePlaceholder title="Mis pagos" /> },
      { path: "documentos", element: <RoutePlaceholder title="Documentos" /> },
      { path: "contratos", element: <RoutePlaceholder title="Contratos" /> },
      { path: "notificaciones", element: <RoutePlaceholder title="Notificaciones" /> },
    ],
  },
  {
    path: "empresa",
    element: <CompanyLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <RoutePlaceholder title="Panel de empresa" /> },
      { path: "dashboard", element: <RoutePlaceholder title="Dashboard" /> },
      { path: "beneficios", element: <RoutePlaceholder title="Beneficios" /> },
      { path: "contratos", element: <RoutePlaceholder title="Contratos" /> },
      { path: "reportes", element: <RoutePlaceholder title="Reportes" /> },
    ],
  },
  {
    path: "admin",
    element: <AdminLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <RoutePlaceholder title="Dashboard administrativo" /> },
      { path: "clientes", element: <RoutePlaceholder title="Clientes" /> },
      { path: "afiliados", element: <RoutePlaceholder title="Afiliados" /> },
      { path: "empresas", element: <RoutePlaceholder title="Empresas" /> },
      { path: "aliados", element: <RoutePlaceholder title="Aliados" /> },
      { path: "planes", element: <RoutePlaceholder title="Planes" /> },
      { path: "pagos", element: <RoutePlaceholder title="Pagos" /> },
      { path: "conciliacion", element: <RoutePlaceholder title="Conciliación" /> },
      { path: "contratos", element: <RoutePlaceholder title="Contratos" /> },
      { path: "legal", element: <RoutePlaceholder title="Legal" /> },
      { path: "pqr", element: <RoutePlaceholder title="PQR" /> },
      { path: "reportes", element: <RoutePlaceholder title="Reportes" /> },
      { path: "auditoria", element: <RoutePlaceholder title="Auditoría" /> },
      { path: "usuarios", element: <RoutePlaceholder title="Usuarios" /> },
    ],
  },
  {
    path: "legal",
    element: <LegalLayout />,
    errorElement: <RouteErrorBoundary />,
    children: Object.entries(LEGAL_ROUTE_TITLES).map(([segment, title]) =>
      segment === ""
        ? { index: true, element: <RoutePlaceholder title={title} /> }
        : { path: segment, element: <RoutePlaceholder title={title} /> },
    ),
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
