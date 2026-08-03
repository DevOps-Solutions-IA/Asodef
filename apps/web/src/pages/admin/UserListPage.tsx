import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge } from "@asodef/ui";
import { listUsers } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth/auth-context";
import type { AdminUserStatus, UserListSortField } from "../../lib/admin/admin-users-types";
import { userStatusTone } from "./user-status-tone";

const PAGE_SIZE = 20;

function formatDate(value: string | null): string {
  if (!value) return "Nunca";
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

export function UserListPage() {
  const { hasPermission } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdminUserStatus | "">("");
  const [role, setRole] = useState("");
  const [sortBy, setSortBy] = useState<UserListSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    status: status || undefined,
    role: role || undefined,
    sortBy,
    sortOrder,
  };

  const query = useQuery({
    queryKey: queryKeys.admin.users.list(filters),
    queryFn: ({ signal }) => listUsers(filters, signal),
    placeholderData: (previous) => previous,
  });

  function resetToFirstPage() {
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuarios"
        description="Administra las cuentas internas de la plataforma."
        actions={
          hasPermission("users.create") ? (
            <Link
              to="/admin/usuarios/nuevo"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-dark px-5 text-sm font-medium text-white transition-colors hover:bg-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo usuario
            </Link>
          ) : undefined
        }
      />

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          resetToFirstPage();
        }}
      >
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="user-search" className="mb-1.5 block text-sm font-medium text-text-main">
            Buscar
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              id="user-search"
              type="search"
              placeholder="Correo o nombre"
              className="pl-10"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetToFirstPage();
              }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="user-status-filter" className="mb-1.5 block text-sm font-medium text-text-main">
            Estado
          </label>
          <Select
            id="user-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminUserStatus | "");
              resetToFirstPage();
            }}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
            <option value="SUSPENDED">Suspendido</option>
          </Select>
        </div>

        <div>
          <label htmlFor="user-role-filter" className="mb-1.5 block text-sm font-medium text-text-main">
            Rol
          </label>
          <Select
            id="user-role-filter"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">Todos</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="ADMIN">ADMIN</option>
            <option value="FINANCE">FINANCE</option>
            <option value="COMMERCIAL">COMMERCIAL</option>
            <option value="CUSTOMER_SERVICE">CUSTOMER_SERVICE</option>
            <option value="COMPANY_PARTNER">COMPANY_PARTNER</option>
            <option value="AFFILIATE">AFFILIATE</option>
            <option value="CUSTOMER">CUSTOMER</option>
            <option value="AUDITOR">AUDITOR</option>
          </Select>
        </div>

        <div>
          <label htmlFor="user-sort-by" className="mb-1.5 block text-sm font-medium text-text-main">
            Ordenar por
          </label>
          <Select
            id="user-sort-by"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as UserListSortField);
              resetToFirstPage();
            }}
          >
            <option value="createdAt">Fecha de creación</option>
            <option value="email">Correo</option>
            <option value="lastLoginAt">Último acceso</option>
            <option value="status">Estado</option>
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
            resetToFirstPage();
          }}
        >
          {sortOrder === "asc" ? "Ascendente" : "Descendente"}
        </Button>
      </form>

      {query.isLoading && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only" role="status">
            Cargando usuarios…
          </span>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState description={getAdminErrorMessage(query.error)} action={<Button onClick={() => query.refetch()}>Reintentar</Button>} />
      )}

      {query.isSuccess && query.data.items.length === 0 && (
        <EmptyState title="No hay usuarios que coincidan" description="Ajusta los filtros o el término de búsqueda." />
      )}

      {query.isSuccess && query.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Lista de usuarios administrativos</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Usuario
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Roles
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Último acceso
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {query.data.items.map((user) => {
                  const { tone, label } = userStatusTone(user.status);
                  return (
                    <tr key={user.id} className="hover:bg-bg-soft/60">
                      <td className="px-4 py-3">
                        <Link to={`/admin/usuarios/${user.id}`} className="font-medium text-brand-dark hover:underline">
                          {user.fullName}
                        </Link>
                        <p className="text-xs text-text-muted">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={tone} label={label} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? (
                            <span className="text-text-muted">Sin rol</span>
                          ) : (
                            user.roles.map((r) => (
                              <Badge key={r} variant="neutral">
                                {r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{formatDate(user.lastLoginAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
