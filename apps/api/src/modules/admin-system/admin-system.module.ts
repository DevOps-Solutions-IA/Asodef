import { Module } from "@nestjs/common";
import { MasterModule } from "../master/master.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminSystemController } from "./admin-system.controller";
import { AdminSystemService } from "./admin-system.service";

@Module({
  imports: [MasterModule, AuthModule, NotificationsModule],
  controllers: [AdminSystemController],
  providers: [AdminSystemService],
})
export class AdminSystemModule {}
