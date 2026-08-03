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
  },
} as const;
