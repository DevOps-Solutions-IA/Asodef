/**
 * Single source of truth for the seeded RBAC data. Both prisma/seed.ts and
 * the RBAC integration tests import from here so the "expected" data can
 * never drift from what's actually seeded.
 *
 * Adding a new permission or role is a data change here, never a schema
 * migration - see the "normalized, not enum" note in schema.prisma.
 */

export interface PermissionDefinition {
  key: string;
  description: string;
}

export const ROLE_NAMES = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE",
  "COMMERCIAL",
  "CUSTOMER_SERVICE",
  "COMPANY_PARTNER",
  "AFFILIATE",
  "CUSTOMER",
  "AUDITOR",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export interface RoleDefinition {
  name: RoleName;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: "payments.read", description: "Ver órdenes y transacciones de pago" },
  { key: "payments.create", description: "Crear órdenes de pago" },
  { key: "payments.reconcile", description: "Ejecutar y resolver conciliación de pagos" },
  { key: "payments.refund", description: "Solicitar y aprobar reembolsos o reversiones" },
  { key: "payments.export", description: "Exportar reportes de pagos" },
  { key: "customers.read", description: "Ver clientes" },
  { key: "customers.create", description: "Crear clientes" },
  { key: "customers.update", description: "Actualizar clientes" },
  { key: "affiliates.read", description: "Ver afiliados" },
  { key: "affiliates.manage", description: "Administrar afiliados" },
  { key: "companies.read", description: "Ver empresas" },
  { key: "companies.manage", description: "Administrar empresas" },
  { key: "crm.manage", description: "Administrar prospectos, oportunidades, propuestas y convenios" },
  { key: "partners.manage", description: "Administrar aliados comerciales y su publicación" },
  { key: "contracts.read", description: "Ver contratos" },
  { key: "contracts.manage", description: "Administrar contratos" },
  { key: "contracts.approve", description: "Aprobar contratos" },
  { key: "documents.read", description: "Ver documentos privados" },
  { key: "documents.manage", description: "Administrar documentos privados" },
  { key: "reports.read", description: "Ver reportes" },
  { key: "reports.export", description: "Exportar reportes" },
  { key: "users.read", description: "Ver usuarios internos" },
  { key: "users.manage", description: "Administrar usuarios internos" },
  { key: "users.unlock", description: "Desbloquear cuentas de usuario tras un bloqueo por intentos fallidos" },
  { key: "roles.manage", description: "Administrar roles" },
  { key: "permissions.manage", description: "Administrar permisos" },
  { key: "content.read", description: "Ver contenido institucional" },
  { key: "content.manage", description: "Administrar contenido institucional" },
  { key: "audit.read", description: "Ver auditoría" },
  { key: "settings.manage", description: "Administrar configuración del sistema" },
  { key: "legal.approve", description: "Aprobar y publicar documentos legales" },
  { key: "data.manage", description: "Gestionar solicitudes de derechos de datos (habeas data)" },
  { key: "retention.manage", description: "Aprobar retención, anonimización o eliminación de datos" },
  { key: "pqr.manage", description: "Gestionar casos de PQR" },
  { key: "approvals.manage", description: "Administrar aprobaciones legales y comerciales de producción" },
];

export const ROLE_CATALOG: RoleDefinition[] = [
  { name: "SUPER_ADMIN", description: "Control total de la plataforma, incluyendo roles, permisos y configuración" },
  { name: "ADMIN", description: "Operación general de la plataforma" },
  { name: "FINANCE", description: "Pagos, conciliación, reembolsos y reportes financieros" },
  { name: "COMMERCIAL", description: "Prospectos, oportunidades, empresas y aliados" },
  { name: "CUSTOMER_SERVICE", description: "Atención a clientes, PQR y solicitudes de datos" },
  { name: "COMPANY_PARTNER", description: "Acceso limitado de una empresa aliada a su propia información" },
  { name: "AFFILIATE", description: "Acceso limitado de un afiliado a su propia información" },
  { name: "CUSTOMER", description: "Acceso limitado de un cliente a su propia información" },
  { name: "AUDITOR", description: "Acceso de solo lectura a auditoría y reportes" },
];

const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

// US-008 correction: legal.approve joins the platform-governance set.
// "Aprobar y publicar documentos legales" is exactly the kind of
// irreversible, production-legal-risk action ("manage legal/commercial
// approval rules") the US-008 governance review calls out as
// SUPER_ADMIN-only - it was previously reachable by ADMIN (everything
// not explicitly excluded), which was too broad. See rbac-catalog.spec.ts
// for the test locking this in.
//
// US-009: users.unlock (manual account-unlock, AccountUnlockService)
// joins the same set. Nothing in the approved matrix explicitly grants
// broad account-unlock capability to ADMIN, so per that story's explicit
// instruction it stays SUPER_ADMIN-only rather than being silently
// inherited via "everything ADMIN doesn't lose".
const PLATFORM_ONLY_KEYS = [
  "roles.manage",
  "permissions.manage",
  "settings.manage",
  "approvals.manage",
  "legal.approve",
  "users.unlock",
];

/**
 * Role -> permission key mapping.
 *
 * ADMIN intentionally excludes the six platform-defining permissions
 * (roles/permissions/settings/approvals/legal-approve/users.unlock) so
 * that changing the platform's own governance rules, publishing binding
 * legal documents, or unlocking a locked-out account always requires
 * SUPER_ADMIN, not just day-to-day operational
 * access. COMPANY_PARTNER/AFFILIATE/CUSTOMER permissions are resource-type
 * gates only - they do not imply row-level scoping. The service layer for
 * each self-service portal (a later story) must still restrict a
 * partner/affiliate/customer to their own records using the ownership/
 * organization-scope policies in common/authorization/ (US-008); this
 * permission table cannot express "only their own company" by itself.
 */
export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  SUPER_ADMIN: ALL_PERMISSION_KEYS,
  ADMIN: ALL_PERMISSION_KEYS.filter((key) => !PLATFORM_ONLY_KEYS.includes(key)),
  FINANCE: [
    "payments.read",
    "payments.reconcile",
    "payments.refund",
    "payments.export",
    "reports.read",
    "reports.export",
    "audit.read",
  ],
  COMMERCIAL: [
    "customers.read",
    "customers.create",
    "customers.update",
    "affiliates.read",
    "companies.read",
    "companies.manage",
    "crm.manage",
    "partners.manage",
    "contracts.read",
    "reports.read",
    "content.read",
  ],
  CUSTOMER_SERVICE: [
    "customers.read",
    "customers.update",
    "payments.read",
    "pqr.manage",
    "data.manage",
    "documents.read",
    "contracts.read",
    "content.read",
  ],
  COMPANY_PARTNER: ["companies.read", "contracts.read", "documents.read"],
  AFFILIATE: ["customers.read", "payments.read"],
  CUSTOMER: ["payments.read"],
  AUDITOR: ["audit.read", "reports.read", "reports.export", "content.read", "payments.read", "contracts.read", "documents.read"],
};
