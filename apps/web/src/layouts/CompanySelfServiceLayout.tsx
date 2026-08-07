/* eslint-disable react-refresh/only-export-components */
import { BarChart3, CreditCard, FileCheck2, FileText, Gift, LayoutDashboard, MessagesSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@asodef/ui";
import { SelfServiceShell, type SelfServiceNavItem } from "../components/self-service";
import { useCompanySelfService } from "../lib/self-service";

export const COMPANY_SELF_SERVICE_NAV: readonly SelfServiceNavItem[] = [
  { to: "/empresa", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/empresa/beneficios", label: "Beneficios", icon: Gift },
  { to: "/empresa/contratos", label: "Contratos", icon: FileCheck2 },
  { to: "/empresa/pagos", label: "Pagos", icon: CreditCard },
  { to: "/empresa/documentos", label: "Documentos", icon: FileText },
  { to: "/empresa/solicitudes", label: "Solicitudes", icon: MessagesSquare },
  { to: "/empresa/reportes", label: "Reportes", icon: BarChart3 },
];

export function CompanySelfServiceLayout() {
  const { endSession } = useCompanySelfService();
  return <SelfServiceShell title="Portal de empresas" navLabel="Autoservicio empresarial" items={COMPANY_SELF_SERVICE_NAV} footer={<div className="flex flex-col gap-2"><Link to="/legal/condiciones-portal-empresarial" className="hover:underline">Condiciones del portal</Link><Link to="/legal/tratamiento-de-datos" className="hover:underline">Tratamiento de datos</Link><Button variant="ghost" size="sm" className="mt-2 justify-start" onClick={() => void endSession()}>Cerrar sesión</Button></div>} />;
}
