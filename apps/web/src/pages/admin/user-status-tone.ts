import type { StatusTone } from "@asodef/ui";
import type { AdminUserStatus } from "../../lib/admin/admin-users-types";

export function userStatusTone(status: AdminUserStatus): { tone: StatusTone; label: string } {
  switch (status) {
    case "ACTIVE":
      return { tone: "active", label: "Activo" };
    case "INACTIVE":
      return { tone: "inactive", label: "Inactivo" };
    case "SUSPENDED":
      return { tone: "warning", label: "Suspendido" };
  }
}
