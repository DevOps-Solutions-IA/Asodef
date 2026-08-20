import { Module } from "@nestjs/common";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { RoleAssignmentService } from "./role-assignment.service";
import { AuthModule } from "../auth/auth.module";

/**
 * Service-layer-only for now (US-008 section 10) - no controller. A
 * future admin-platform story wires an HTTP surface on top of
 * RoleAssignmentService, gated by its own @RequireRoles("SUPER_ADMIN")
 * route guard in addition to this service's own actor check.
 */
@Module({
  imports: [SecurityEventsModule, AuthModule],
  providers: [RoleAssignmentService],
  exports: [RoleAssignmentService],
})
export class GovernanceModule {}
