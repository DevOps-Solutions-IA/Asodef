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
} as const;
