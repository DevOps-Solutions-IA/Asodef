import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileClock,
  Gauge,
  KeyRound,
  Landmark,
  MonitorSmartphone,
  Scale,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Users,
  UserRoundCheck,
} from "lucide-react";
import { useAuth } from "../lib/auth/auth-context";
import {
  WorkspaceShell,
  type WorkspaceNavGroup,
  type WorkspaceNavItem,
} from "./shared/WorkspaceShell";

// US-060's literal nav list. `permission` is the key required to SHOW the
// item (and matches the PermissionRoute guarding its route in router.tsx -
// see that file for the "usuarios stays users.read, not the AC Example's
// users.manage" note). Only destinations backed by a real page and API
// belong here; legacy RoutePlaceholder routes remain addressable but are
// deliberately not advertised as operational capabilities.
const NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: "Gestión",
    items: [
      {
        to: "/admin",
        label: "Dashboard",
        icon: Gauge,
        end: true,
        permission: null,
      },
      // Both entries reuse the existing CRM routes and permission model.
      {
        to: "/admin/crm",
        label: "CRM",
        icon: BriefcaseBusiness,
        permission: "crm.read",
      },
      {
        to: "/admin/crm/empresas",
        label: "Empresas y aliados",
        icon: Building2,
        permission: "crm.read",
      },
    ],
  },
  {
    label: "Operación",
    items: [
      {
        to: "/admin/pagos",
        label: "Pagos",
        icon: CreditCard,
        permission: "payments.read",
      },
      {
        to: "/admin/conciliacion",
        label: "Conciliación",
        icon: Landmark,
        permission: "payments.reconcile",
      },
    ],
  },
  {
    label: "Cumplimiento",
    items: [
      {
        to: "/admin/legal",
        label: "Legal",
        icon: Scale,
        permission: "content.manage",
      },
      {
        to: "/admin/consentimientos",
        label: "Consentimientos",
        icon: UserRoundCheck,
        permission: "data.manage",
      },
      {
        to: "/admin/solicitudes-de-datos",
        label: "Solicitudes de datos",
        icon: ScrollText,
        permission: "data.manage",
      },
      {
        to: "/admin/pqr",
        label: "PQR",
        icon: ClipboardCheck,
        permission: "pqr.manage",
      },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      {
        to: "/admin/reportes",
        label: "Reportes",
        icon: BarChart3,
        permission: "reports.read",
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        to: "/admin/usuarios",
        label: "Usuarios",
        icon: Users,
        permission: "users.read",
      },
      {
        to: "/admin/auditoria",
        label: "Auditoría",
        icon: FileClock,
        permission: "audit.read",
      },
      {
        to: "/admin/sistema",
        label: "Sistema",
        icon: ServerCog,
        permission: "settings.manage",
      },
    ],
  },
];

const ACCOUNT_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/admin/mi-cuenta/seguridad",
    label: "Mi cuenta",
    icon: KeyRound,
    permission: "users.security.read",
  },
  {
    to: "/admin/mi-cuenta/seguridad#contrasena",
    label: "Contraseña",
    icon: KeyRound,
    permission: "users.security.read",
  },
  {
    to: "/admin/mi-cuenta/seguridad#mfa",
    label: "MFA",
    icon: ShieldCheck,
    permission: "users.security.read",
  },
  {
    to: "/admin/mi-cuenta/sesiones",
    label: "Sesiones",
    icon: MonitorSmartphone,
    permission: "users.sessions.read",
  },
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
  const visibleNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.permission == null || hasPermission(item.permission),
    ),
  })).filter((group) => group.items.length > 0);
  return (
    <WorkspaceShell
      productLabel="Panel administrativo"
      navLabel="Administración"
      navGroups={visibleNavGroups}
      accountItems={ACCOUNT_ITEMS}
    />
  );
}
