import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";
import { RedisModule } from "../../common/redis/redis.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsService } from "./communications.service";
import { EmailOutboxAdapter } from "./email-outbox.adapter";
import { PublishedTemplateRenderer } from "./published-template.renderer";
import { CommunicationChannelRegistry } from "./communication-channel.registry";
import { CommunicationRecipientPolicyService } from "./communication-recipient-policy.service";

@Module({
  imports: [RedisModule, AuthModule, NotificationsModule],
  controllers: [CommunicationsController],
  providers: [
    CommunicationsService,
    EmailOutboxAdapter,
    PublishedTemplateRenderer,
    CommunicationChannelRegistry,
    CommunicationRecipientPolicyService,
  ],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
