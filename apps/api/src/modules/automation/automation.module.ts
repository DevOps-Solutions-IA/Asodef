import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { AutomationEngineService } from "./automation-engine.service";

@Module({
  imports: [CommunicationsModule],
  providers: [AutomationEngineService],
  exports: [AutomationEngineService],
})
export class AutomationModule {}
