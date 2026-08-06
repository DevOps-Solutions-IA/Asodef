import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../../lib/auth/auth-context";
import { Building2, KanbanSquare, Radar, UsersRound } from "lucide-react";
import { PageHeader } from "@asodef/ui";

const TABS = [
  { to: "/admin/crm/prospectos", label: "Prospectos", icon: UsersRound },
  { to: "/admin/crm/oportunidades", label: "Oportunidades", icon: KanbanSquare },
  { to: "/admin/crm/empresas", label: "Empresas", icon: Building2 },
];

/**
 * US-061: shared shell for the CRM section's 3 sub-screens. router.tsx
 * gates the whole /admin/crm subtree on crm.read (visibility); this
 * component additionally disables every mutating action on its child
 * pages via hasPermission("crm.manage") for an actor who has crm.read
 * but not crm.manage (AC5's own negative case: read-only, not hidden).
 */
export function CrmLayout() {
  const { hasPermission } = useAuth();
  const readOnly = !hasPermission("crm.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Gestión de relaciones" icon={<Radar className="h-5 w-5" />} title="CRM" description={readOnly ? "Consulta comercial en modo de solo lectura." : "Prospectos, oportunidades y empresas en una vista comercial integrada."} />
      {readOnly && <p className="-mt-3 text-sm text-text-muted">Modo de solo lectura: no tienes permiso para modificar registros de CRM.</p>}

      <nav aria-label="Secciones de CRM" className="flex gap-2 overflow-x-auto rounded-2xl border border-border-soft bg-white p-2 shadow-e1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                isActive ? "border-brand-dark/10 bg-brand-dark text-white shadow-e1" : "border-transparent text-text-muted hover:bg-bg-soft hover:text-text-main"
              }`
            }
          >
            <tab.icon aria-hidden="true" className="h-4 w-4" />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
