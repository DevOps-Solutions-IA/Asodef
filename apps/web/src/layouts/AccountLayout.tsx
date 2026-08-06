import { Bell, CreditCard, FileText, LayoutDashboard, ScrollText, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { WorkspaceShell, type WorkspaceNavItem } from "./shared/WorkspaceShell";

const NAV_ITEMS: WorkspaceNavItem[] = [
  { to: "/mi-cuenta", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/mi-cuenta/perfil", label: "Perfil", icon: UserRound },
  { to: "/mi-cuenta/pagos", label: "Pagos", icon: CreditCard },
  { to: "/mi-cuenta/documentos", label: "Documentos", icon: FileText },
  { to: "/mi-cuenta/contratos", label: "Contratos", icon: ScrollText },
  { to: "/mi-cuenta/notificaciones", label: "Notificaciones", icon: Bell },
];

/** Customer self-service account shell (/mi-cuenta/*). Real authentication
 * and permission enforcement land in later stories - this establishes the
 * stable layout/nav structure those stories build inside. */
export function AccountLayout() {
  return (
    <WorkspaceShell
      productLabel="Mi cuenta"
      navLabel="Cuenta"
      navItems={NAV_ITEMS}
      footerLinks={<><Link to="/legal/condiciones-portal-afiliado" className="hover:text-brand-dark hover:underline">Condiciones del portal</Link><Link to="/legal/politica-de-privacidad" className="hover:text-brand-dark hover:underline">Privacidad</Link></>}
    />
  );
}
