import { Module } from "@nestjs/common";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { AuthModule } from "../auth/auth.module";
import { GovernanceModule } from "../governance/governance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  imports: [SecurityEventsModule, AuthModule, GovernanceModule, NotificationsModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
