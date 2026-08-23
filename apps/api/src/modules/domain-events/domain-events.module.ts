import { Module } from "@nestjs/common";
import { AutomationModule } from "../automation/automation.module";
import { DomainEventDispatcherService } from "./domain-event-dispatcher.service";

@Module({
  imports: [AutomationModule],
  providers: [DomainEventDispatcherService],
  exports: [DomainEventDispatcherService],
})
export class DomainEventsModule {}
