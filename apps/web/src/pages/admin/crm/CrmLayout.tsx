import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../../lib/auth/auth-context";

const TABS = [
  { to: "/admin/crm/prospectos", label: "Prospectos" },
  { to: "/admin/crm/oportunidades", label: "Oportunidades" },
  { to: "/admin/crm/empresas", label: "Empresas" },
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
      <div>
        <h1 className="font-display text-2xl font-semibold text-brand-dark">CRM</h1>
        {readOnly && <p className="mt-1 text-sm text-text-muted">Modo de solo lectura: no tienes permiso para modificar registros de CRM.</p>}
      </div>

      <nav aria-label="Secciones de CRM" className="flex gap-2 border-b border-border-soft">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "border-brand-dark text-brand-dark" : "border-transparent text-text-muted hover:text-text-main"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
