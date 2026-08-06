import {
  BarChart3, BriefcaseBusiness, Building2, ClipboardCheck, CreditCard, FileCheck2, FileText,
  Gauge, Handshake, Landmark, Megaphone, Scale, ScrollText, ShieldCheck, Users, UserRoundCheck,
} from "lucide-react";
import { useAuth } from "../lib/auth/auth-context";
import { WorkspaceShell, type WorkspaceNavItem } from "./shared/WorkspaceShell";

// US-060's literal nav list. `permission` is the key required to SHOW the
// item (and matches the PermissionRoute guarding its route in router.tsx -
// see that file for the "usuarios stays users.read, not the AC Example's
// users.manage" note). Items with no `permission` (Dashboard, Planes)
// render for every internal-staff role that already cleared the outer
// RoleRoute gate - no permission key exists for them and none is invented.
const NAV_ITEMS: WorkspaceNavItem[] = [
  { to: "/admin", label: "Dashboard", icon: Gauge, end: true, permission: null },
  // crm.read gates visibility (crm.manage additionally gates mutation
  // inside the section - see router.tsx). "Empresas y aliados" is a
  // second entry point into that same CRM section's "empresas" tab, not a
  // separate page, so it shares the same permission.
  { to: "/admin/crm", label: "CRM", icon: BriefcaseBusiness, permission: "crm.read" },
  { to: "/admin/crm/empresas", label: "Empresas y aliados", icon: Building2, permission: "crm.read" },
  { to: "/admin/planes", label: "Planes", icon: Handshake, permission: null },
  { to: "/admin/contratos", label: "Contratos", icon: FileCheck2, permission: "contracts.read" },
  { to: "/admin/comunicaciones", label: "Comunicaciones", icon: Megaphone, permission: null },
  { to: "/admin/pagos", label: "Pagos", icon: CreditCard, permission: "payments.read" },
  { to: "/admin/conciliacion", label: "Conciliación", icon: Landmark, permission: "payments.reconcile" },
  // content.manage gates visibility (legal.approve additionally gates
  // approve/publish inside the page - see router.tsx).
  { to: "/admin/legal", label: "Legal", icon: Scale, permission: "content.manage" },
  { to: "/admin/consentimientos", label: "Consentimientos", icon: UserRoundCheck, permission: "data.manage" },
  { to: "/admin/solicitudes-de-datos", label: "Solicitudes de datos", icon: ScrollText, permission: "data.manage" },
  { to: "/admin/pqr", label: "PQR", icon: ClipboardCheck, permission: "pqr.manage" },
  { to: "/admin/aprobaciones", label: "Aprobaciones", icon: ShieldCheck, permission: "approvals.manage" },
  { to: "/admin/reportes", label: "Reportes", icon: BarChart3, permission: "reports.read" },
  { to: "/admin/auditoria", label: "Auditoría", icon: FileText, permission: "audit.read" },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users, permission: "users.read" },
];

/**
 * Administrative platform shell (/admin/*). This is the widest nav of the
 * three authenticated portals, always lazy-loaded (see routes/router.tsx)
 * since it's never needed on first paint of the public site.
 *
 * US-060: the outer RoleRoute (router.tsx) gates who reaches /admin/* at
 * all; this component additionally hides nav items the current user lacks
 * permission for (AC1's "render only the navigation sections the current
 * user's permissions allow"). Hiding the nav item is a UX nicety only -
 * direct navigation to a hidden section is independently blocked by that
 * section's own PermissionRoute, which renders ForbiddenPage, per AC1's
 * explicit "not just a hidden nav item" requirement.
 */
export function AdminLayout() {
  const { hasPermission } = useAuth();
  const visibleNavItems = NAV_ITEMS.filter((item) => item.permission == null || hasPermission(item.permission));
  return <WorkspaceShell productLabel="Panel administrativo" navLabel="Administración" navItems={visibleNavItems} />;
}
