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
    mfaStatus: () => ["auth", "mfa", "status"] as const,
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
  me: {
    /** GET /me/consent-records (US-071) - always the caller's own. */
    consentRecords: () => ["me", "consent-records"] as const,
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
      prospects: (filters?: unknown) => filters === undefined ? ["admin", "crm", "prospects"] as const : ["admin", "crm", "prospects", filters] as const,
      leads: (filters?: unknown) => filters === undefined ? ["admin", "crm", "leads"] as const : ["admin", "crm", "leads", filters] as const,
      opportunities: (filters?: unknown) => filters === undefined ? ["admin", "crm", "opportunities"] as const : ["admin", "crm", "opportunities", filters] as const,
      opportunity: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId] as const,
      statusHistory: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "status-history"] as const,
      timeline: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "timeline"] as const,
      activities: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "activities"] as const,
      proposals: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "proposals"] as const,
      agreements: (opportunityId: string) => ["admin", "crm", "opportunities", opportunityId, "agreements"] as const,
      companies: (filters?: unknown) => filters === undefined ? ["admin", "crm", "companies"] as const : ["admin", "crm", "companies", filters] as const,
      company: (companyId: string) => ["admin", "crm", "companies", companyId] as const,
      companyContacts: (companyId: string) => ["admin", "crm", "companies", companyId, "contacts"] as const,
      companySites: (companyId: string) => ["admin", "crm", "companies", companyId, "sites"] as const,
      partners: (filters?: unknown) => filters === undefined ? ["admin", "crm", "partners"] as const : ["admin", "crm", "partners", filters] as const,
      partner: (partnerId: string) => ["admin", "crm", "partners", partnerId] as const,
    },
    legal: {
      documents: () => ["admin", "legal", "documents"] as const,
      document: (documentId: string) => ["admin", "legal", "documents", documentId] as const,
    },
    consent: {
      search: (filters: unknown) => ["admin", "consent", "search", filters] as const,
      detail: (recordId: string) => ["admin", "consent", "detail", recordId] as const,
    },
    dsr: {
      list: (filters: unknown) => ["admin", "dsr", "list", filters] as const,
      detail: (id: string) => ["admin", "dsr", "detail", id] as const,
    },
    pqr: {
      list: (filters: unknown) => ["admin", "pqr", "list", filters] as const,
      detail: (id: string) => ["admin", "pqr", "detail", id] as const,
    },
    payments: {
      search: (filters: unknown) => ["admin", "payments", "search", filters] as const,
      order: (id: string) => ["admin", "payments", "order", id] as const,
      events: (id: string) => ["admin", "payments", "order", id, "events"] as const,
      refunds: (id: string) => ["admin", "payments", "order", id, "refunds"] as const,
    },
    reconciliation: {
      runs: () => ["admin", "reconciliation", "runs"] as const,
      differences: (runId: string) => ["admin", "reconciliation", "runs", runId, "differences"] as const,
    },
    dashboard: () => ["admin", "dashboard"] as const,
    system: () => ["admin", "system"] as const,
    audit: (filters: unknown) => ["admin", "audit", filters] as const,
    reports: {
      list: () => ["admin", "reports", "list"] as const,
      run: (key: string, filters: unknown) => ["admin", "reports", "run", key, filters] as const,
      job: (jobId: string) => ["admin", "reports", "job", jobId] as const,
    },
    knowledge: {
      all: () => ["admin", "knowledge"] as const,
      list: (filters: unknown) => ["admin", "knowledge", "list", filters] as const,
      item: (id: string) => ["admin", "knowledge", "item", id] as const,
      diff: (versionId: string) => ["admin", "knowledge", "diff", versionId] as const,
    },
  },
} as const;
