/* eslint-disable react-refresh/only-export-components */
import { Navigate, Outlet, type RouteObject } from "react-router-dom";
import { AffiliateSelfServiceProvider } from "../lib/self-service";
import { AffiliateSelfServiceLayout } from "../layouts/AffiliateSelfServiceLayout";
import { SelfServiceAccessLayout } from "../layouts/SelfServiceAccessLayout";
import { RouteErrorBoundary } from "../layouts/shared/RouteErrorBoundary";
import {
  AffiliateAccessPage, AffiliateAccountStatementPage, AffiliateAffiliationPage, AffiliateBeneficiariesPage,
  AffiliateDocumentsPage, AffiliateNotificationsPage, AffiliatePaymentsPage, AffiliateRequestsPage, AffiliateSummaryPage,
  BeneficiaryChangeCreatePage, BeneficiaryChangeDetailPage,
} from "../pages/self-service";
import { AffiliateSessionRoute } from "./AffiliateSessionRoute";

function AffiliateSelfServiceRoot() { return <AffiliateSelfServiceProvider><Outlet /></AffiliateSelfServiceProvider>; }

export const affiliateSelfServiceRoute: RouteObject = {
  path: "mi-cuenta",
  element: <AffiliateSelfServiceRoot />,
  errorElement: <RouteErrorBoundary />,
  children: [
    { element: <SelfServiceAccessLayout />, children: [{ path: "acceso", element: <AffiliateAccessPage /> }] },
    { element: <AffiliateSessionRoute />, children: [{ element: <AffiliateSelfServiceLayout />, children: [
      { index: true, element: <AffiliateSummaryPage /> },
      { path: "perfil", element: <Navigate to="/mi-cuenta/afiliacion" replace /> },
      { path: "afiliacion", element: <AffiliateAffiliationPage /> },
      { path: "beneficiarios", element: <AffiliateBeneficiariesPage /> },
      { path: "beneficiarios/nueva-solicitud", element: <BeneficiaryChangeCreatePage /> },
      { path: "beneficiarios/solicitudes/:requestId", element: <BeneficiaryChangeDetailPage /> },
      { path: "estado-de-cuenta", element: <AffiliateAccountStatementPage /> },
      { path: "pagos", element: <AffiliatePaymentsPage /> },
      { path: "documentos", element: <AffiliateDocumentsPage /> },
      { path: "solicitudes", element: <AffiliateRequestsPage /> },
      { path: "notificaciones", element: <AffiliateNotificationsPage /> },
    ] }] },
  ],
};
