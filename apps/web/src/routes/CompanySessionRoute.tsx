import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useCompanySelfService } from "../lib/self-service";
import { SelfServiceStatePanel } from "../components/self-service";

export function CompanySessionRoute() {
  const { state, refreshSession } = useCompanySelfService();
  const location = useLocation();
  if (state.status === "lookup_pending") return <div className="mx-auto max-w-3xl px-4 py-12"><SelfServiceStatePanel status="loading" /></div>;
  if (state.status === "verified") return <Outlet />;
  if (state.status === "provider_unavailable") return <div className="mx-auto max-w-3xl px-4 py-12"><SelfServiceStatePanel status="unavailable" message={state.message} onRetry={() => void refreshSession()} /></div>;
  if (state.status === "locked") return <div className="mx-auto max-w-3xl px-4 py-12"><SelfServiceStatePanel status="unauthorized" message={state.message} /></div>;
  if (state.status === "expired") return <div className="mx-auto max-w-3xl space-y-4 px-4 py-12"><SelfServiceStatePanel status="expired" message={state.message} /><Link to="/empresa/acceso" className="mx-auto flex h-11 w-fit items-center rounded-full bg-brand-dark px-5 text-sm font-medium text-white">Volver a verificar</Link></div>;
  return <Navigate to="/empresa/acceso" replace state={{ from: location.pathname }} />;
}
