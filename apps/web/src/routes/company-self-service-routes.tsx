/* eslint-disable react-refresh/only-export-components */
import { Navigate, Outlet, type RouteObject } from "react-router-dom";
import { CompanySelfServiceProvider } from "../lib/self-service";
import { CompanySelfServiceLayout } from "../layouts/CompanySelfServiceLayout";
import { SelfServiceAccessLayout } from "../layouts/SelfServiceAccessLayout";
import { RouteErrorBoundary } from "../layouts/shared/RouteErrorBoundary";
import { CompanyAccessPage, CompanyBenefitsPage, CompanyContractsPage, CompanyDocumentsPage, CompanyPaymentsPage, CompanyReportsPage, CompanyRequestsPage, CompanySummaryPage } from "../pages/self-service";
import { CompanySessionRoute } from "./CompanySessionRoute";

function CompanySelfServiceRoot() { return <CompanySelfServiceProvider><Outlet /></CompanySelfServiceProvider>; }

export const companySelfServiceRoute: RouteObject = {
  path: "empresa",
  element: <CompanySelfServiceRoot />,
  errorElement: <RouteErrorBoundary />,
  children: [
    { element: <SelfServiceAccessLayout />, children: [{ path: "acceso", element: <CompanyAccessPage /> }] },
    { element: <CompanySessionRoute />, children: [{ element: <CompanySelfServiceLayout />, children: [
      { index: true, element: <CompanySummaryPage /> },
      { path: "dashboard", element: <Navigate to="/empresa/resumen" replace /> },
      { path: "resumen", element: <CompanySummaryPage /> },
      { path: "beneficios", element: <CompanyBenefitsPage /> },
      { path: "contratos", element: <CompanyContractsPage /> },
      { path: "pagos", element: <CompanyPaymentsPage /> },
      { path: "documentos", element: <CompanyDocumentsPage /> },
      { path: "solicitudes", element: <CompanyRequestsPage /> },
      { path: "reportes", element: <CompanyReportsPage /> },
    ] }] },
  ],
};
