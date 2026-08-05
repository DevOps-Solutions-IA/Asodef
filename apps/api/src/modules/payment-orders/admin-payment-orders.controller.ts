import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RequireRoles } from "../auth/decorators/roles.decorator";
import { PaymentOrdersService } from "./payment-orders.service";
import { SearchPaymentOrdersQueryDto } from "./dto/search-payment-orders-query.dto";

const INTERNAL_STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE", "COMMERCIAL", "CUSTOMER_SERVICE", "AUDITOR"];

/**
 * US-063 AC1: admin search/detail/event-history, split into its own
 * admin/payment-orders-prefixed controller rather than bolted onto the
 * public-facing PaymentOrdersController (which is @Controller("payment-
 * orders"), not "admin/...") - matches every other domain's own
 * admin.controller.ts convention (companies, reconciliation, etc.).
 *
 * Real gap found while writing this controller's own tests: CUSTOMER
 * holds payments.read too (for its own self-service payment lookup -
 * rbac-catalog.ts), but that permission grant carries no row-level
 * scoping (the RBAC design's own doc comment on ROLE_PERMISSIONS says
 * as much). @RequirePermissions("payments.read") alone would have let
 * any authenticated customer search/read every OTHER customer's
 * payment orders through this admin endpoint. @RequireRoles restricts
 * this to the same internal-staff set the frontend's own admin-shell
 * RoleRoute already uses (US-060) - AND'd with the permission check
 * (both APP_GUARDs must pass), never an either/or.
 */
@ApiTags("payment-orders")
@ApiCookieAuth("asodef_at")
@RequirePermissions("payments.read")
@RequireRoles(...INTERNAL_STAFF_ROLES)
@Controller("admin/payment-orders")
export class AdminPaymentOrdersController {
  constructor(private readonly paymentOrdersService: PaymentOrdersService) {}

  // Registered before ":id" below so a literal "search" path segment is
  // never swallowed as an :id value.
  @Get("search")
  search(@Query() query: SearchPaymentOrdersQueryDto) {
    return this.paymentOrdersService.search(query);
  }

  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.paymentOrdersService.findByIdForAdmin(id);
  }

  @Get(":id/events")
  listEvents(@Param("id", ParseUUIDPipe) id: string) {
    return this.paymentOrdersService.listEvents(id);
  }
}
