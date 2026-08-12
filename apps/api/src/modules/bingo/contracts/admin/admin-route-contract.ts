import { BINGO_ADMIN_PERMISSION_MAP } from "../common";

export interface BingoAdminRouteContract {
  method: "GET" | "POST" | "PATCH";
  path: string;
  permission: (typeof BINGO_ADMIN_PERMISSION_MAP)[keyof typeof BINGO_ADMIN_PERMISSION_MAP];
  mutation: boolean;
  requiresIdempotencyKey: boolean;
}

export const BINGO_ADMIN_ROUTE_CONTRACTS: readonly BingoAdminRouteContract[] = Object.freeze([
  { method: "GET", path: "/admin/bingo/events", permission: "bingo.read", mutation: false, requiresIdempotencyKey: false },
  { method: "POST", path: "/admin/bingo/events", permission: "bingo.create", mutation: true, requiresIdempotencyKey: true },
  { method: "PATCH", path: "/admin/bingo/events/:eventId", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/events/:eventId/rounds", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/events/:eventId/patterns", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/rounds/:roundId/prizes", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/events/:eventId/participants", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/events/:eventId/cards/generate", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/cards/:cardId/assignments", permission: "bingo.manage", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/executions/:executionId/start", permission: "bingo.operate", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/executions/:executionId/pause", permission: "bingo.operate", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/executions/:executionId/resume", permission: "bingo.operate", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/executions/:executionId/draws", permission: "bingo.operate", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/candidates/:candidateId/validate", permission: "bingo.validate", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/candidates/:candidateId/reject", permission: "bingo.validate", mutation: true, requiresIdempotencyKey: true },
  { method: "POST", path: "/admin/bingo/candidates/:candidateId/winners", permission: "bingo.validate", mutation: true, requiresIdempotencyKey: true },
  { method: "GET", path: "/admin/bingo/events/:eventId/audit", permission: "bingo.audit.read", mutation: false, requiresIdempotencyKey: false },
  { method: "GET", path: "/admin/bingo/reports/:reportId", permission: "bingo.read", mutation: false, requiresIdempotencyKey: false },
]);

