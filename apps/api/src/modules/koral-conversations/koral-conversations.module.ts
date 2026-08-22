import { Module } from "@nestjs/common";
import { KoralConversationsController } from "./koral-conversations.controller";
import { KoralConversationsService } from "./koral-conversations.service";

@Module({
  controllers: [KoralConversationsController],
  providers: [KoralConversationsService],
  exports: [KoralConversationsService],
})
export class KoralConversationsModule {}
