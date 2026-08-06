import { BarChart3, FileCheck2, Gift, LayoutDashboard, LineChart } from "lucide-react";
import { Link } from "react-router-dom";
import { WorkspaceShell, type WorkspaceNavItem } from "./shared/WorkspaceShell";

const NAV_ITEMS: WorkspaceNavItem[] = [
  { to: "/empresa", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/empresa/dashboard", label: "Dashboard", icon: LineChart },
  { to: "/empresa/beneficios", label: "Beneficios", icon: Gift },
  { to: "/empresa/contratos", label: "Contratos", icon: FileCheck2 },
  { to: "/empresa/reportes", label: "Reportes", icon: BarChart3 },
];

/** Business-partner self-service portal (/empresa/*). Distinct accent
 * (brand-green) from AccountLayout/AdminLayout so the three authenticated
 * areas remain visually distinguishable, not one reused shell. */
export function CompanyLayout() {
  return (
    <WorkspaceShell
      productLabel="Portal de empresas"
      navLabel="Gestión corporativa"
      navItems={NAV_ITEMS}
      tone="dark"
      footerLinks={<><Link to="/legal/condiciones-portal-empresarial" className="hover:text-white hover:underline">Condiciones del portal</Link><Link to="/legal/tratamiento-de-datos" className="hover:text-white hover:underline">Tratamiento de datos</Link><Link to="/legal/politica-comunicaciones-electronicas" className="hover:text-white hover:underline">Comunicaciones</Link></>}
    />
  );
}
