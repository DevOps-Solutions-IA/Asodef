/**
 * Central query key factory - every useQuery/useQueryClient call in this
 * app imports keys from here rather than writing array literals inline,
 * so invalidation (`queryClient.invalidateQueries({ queryKey:
 * queryKeys.paymentOrders.all() })`) always targets a consistent,
 * discoverable set of keys. Add a new domain's keys here when that
 * domain's story lands - don't invent ad hoc keys in components.
 */
export const queryKeys = {
  health: {
    ready: () => ["health", "ready"] as const,
  },
  auth: {
    /** The single query key for session discovery (GET /auth/me) - every
     * consumer (AuthProvider, route guards) reads/invalidates through this
     * one key, never an inline literal (US-010: "avoid duplicating session
     * state in multiple global stores"). */
    me: () => ["auth", "me"] as const,
  },
  content: {
    /** GET /content - published, managed homepage fields (US-020). */
    all: () => ["content"] as const,
  },
  paymentOrders: {
    /** GET /payment-orders/:reference (US-024/US-030). */
    detail: (publicReference: string) => ["payment-orders", "detail", publicReference] as const,
  },
  boldPayments: {
    /** GET /payments/:reference/status (US-025/US-030). */
    status: (publicReference: string) => ["bold-payments", "status", publicReference] as const,
  },
  receipts: {
    /** GET /receipts/:reference (US-027/US-032). */
    detail: (publicReference: string) => ["receipts", "detail", publicReference] as const,
  },
  legalDocuments: {
    /** GET /legal-documents/:slug (US-043/US-045). */
    detail: (slug: string) => ["legal-documents", "detail", slug] as const,
  },
  admin: {
    users: {
      stats: () => ["admin", "users", "stats"] as const,
      list: (filters: unknown) => ["admin", "users", "list", filters] as const,
      detail: (userId: string) => ["admin", "users", "detail", userId] as const,
      roles: (userId: string) => ["admin", "users", "detail", userId, "roles"] as const,
      sessions: (userId: string) => ["admin", "users", "detail", userId, "sessions"] as const,
      securityEvents: (userId: string, filters: unknown) =>
        ["admin", "users", "detail", userId, "security-events", filters] as const,
      /** Shared prefix for invalidating every cached list page at once
       * after a mutation (create/deactivate/reactivate/etc. all change
       * what the list should show). */
      allLists: () => ["admin", "users", "list"] as const,
    },
    crm: {
      prospects: () => ["admin", "crm", "prospects"] as const,
      leads: () => ["admin", "crm", "leads"] as const,
      opportunities: () => ["admin", "crm", "opportunities"] as const,
      opportunity: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId] as const,
      statusHistory: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "status-history"] as const,
      activities: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "activities"] as const,
      proposals: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "proposals"] as const,
      agreements: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "agreements"] as const,
      companies: () => ["admin", "crm", "companies"] as const,
      company: (companyId: string) => ["admin", "crm", "companies", companyId] as const,
      partners: () => ["admin", "crm", "partners"] as const,
      partner: (partnerId: string) => ["admin", "crm", "partners", partnerId] as const,
    },
  },
} as const;
