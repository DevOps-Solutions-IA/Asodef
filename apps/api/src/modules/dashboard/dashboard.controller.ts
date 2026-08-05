import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequireRoles } from "../auth/decorators/roles.decorator";
import { DashboardService } from "./dashboard.service";

const INTERNAL_STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE", "COMMERCIAL", "CUSTOMER_SERVICE", "AUDITOR"];

/**
 * US-064: no single existing permission covers "cross-domain business
 * metrics", and inventing one for a single read-only landing page isn't
 * warranted - but this aggregates business-wide financial/CRM figures
 * (recaudo mensual, tasa de aprobación, etc.), not customer-specific
 * PII, so it must still stay internal-staff-only, not merely
 * authenticated. Same @RequireRoles fix as US-063's real
 * payments.read/CUSTOMER gap - excludes COMPANY_PARTNER/AFFILIATE/
 * CUSTOMER, the external/self-service roles.
 */
@ApiTags("dashboard")
@ApiCookieAuth("asodef_at")
@RequireRoles(...INTERNAL_STAFF_ROLES)
@Controller("admin/dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard() {
    return this.dashboardService.getDashboard();
  }
}
