import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunicationsController } from "./communications.controller";

@Module({
  imports: [NotificationsModule],
  controllers: [CommunicationsController],
})
export class CommunicationsModule {}
