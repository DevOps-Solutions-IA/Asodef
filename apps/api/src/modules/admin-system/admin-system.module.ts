import { Module } from "@nestjs/common";
import { MasterModule } from "../master/master.module";
import { AdminSystemController } from "./admin-system.controller";
import { AdminSystemService } from "./admin-system.service";

@Module({
  imports: [MasterModule],
  controllers: [AdminSystemController],
  providers: [AdminSystemService],
})
export class AdminSystemModule {}
