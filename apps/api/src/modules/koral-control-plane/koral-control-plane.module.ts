import { Module } from "@nestjs/common";
import { KoralControlPlaneController } from "./koral-control-plane.controller";
import { KoralControlPlaneService } from "./koral-control-plane.service";

@Module({
  controllers: [KoralControlPlaneController],
  providers: [KoralControlPlaneService],
})
export class KoralControlPlaneModule {}
