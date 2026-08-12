import { BINGO_ADMIN_ROUTE_CONTRACTS } from "../admin/admin-route-contract";
import { BINGO_AFFILIATE_ROUTE_CONTRACTS } from "../affiliate/affiliate-contract";
import { BINGO_PUBLIC_ROUTE_CONTRACTS } from "../public/public-contract";

export interface BingoOpenApiOperationContract {
  operationId: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  surface: "ADMIN" | "AFFILIATE" | "PUBLIC";
  security: "ADMIN_COOKIE" | "AFFILIATE_SELF_SERVICE_COOKIE" | "NONE";
  responseContract: string;
}

const admin = BINGO_ADMIN_ROUTE_CONTRACTS.map(
  (route, index): BingoOpenApiOperationContract => ({
    operationId: `bingoAdminOperation${index + 1}`,
    method: route.method,
    path: route.path,
    surface: "ADMIN",
    security: "ADMIN_COOKIE",
    responseContract: route.path.includes("audit")
      ? "AdminBingoAuditContract"
      : "BingoAdminCommandResultContract",
  }),
);

const affiliateResponses = [
  "AffiliateBingoEventSummaryContract[]",
  "AffiliateBingoCardContract[]",
  "AffiliateBingoCardContract",
  "AffiliateBingoRoundStateContract",
  "AffiliateBingoHistoryEntryContract[]",
] as const;

const affiliate = BINGO_AFFILIATE_ROUTE_CONTRACTS.map(
  (route, index): BingoOpenApiOperationContract => ({
    operationId: `bingoAffiliateRead${index + 1}`,
    method: route.method,
    path: route.path,
    surface: "AFFILIATE",
    security: "AFFILIATE_SELF_SERVICE_COOKIE",
    responseContract: affiliateResponses[index] ?? "never",
  }),
);

const publicResponses = [
  "PublicBingoEventContract",
  "PublicBingoSnapshotContract",
] as const;
const publicOperations = BINGO_PUBLIC_ROUTE_CONTRACTS.map(
  (route, index): BingoOpenApiOperationContract => ({
    operationId: `bingoPublicRead${index + 1}`,
    method: route.method,
    path: route.path,
    surface: "PUBLIC",
    security: "NONE",
    responseContract: publicResponses[index] ?? "never",
  }),
);

/** Source manifest for future Nest Swagger decorators; it does not register routes. */
export const BINGO_OPENAPI_V1_OPERATIONS = Object.freeze([
  ...admin,
  ...affiliate,
  ...publicOperations,
]);
