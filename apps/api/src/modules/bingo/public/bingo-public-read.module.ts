import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { BingoFeatureFlagsModule } from "../feature-flags";
import { BingoPublicReadController } from "./bingo-public-read.controller";
import { BingoPublicReadService } from "./bingo-public-read.service";

@Module({
  imports: [AuthModule, BingoFeatureFlagsModule],
  controllers: [BingoPublicReadController],
  providers: [BingoPublicReadService],
  exports: [BingoPublicReadService],
})
export class BingoPublicReadModule {}
