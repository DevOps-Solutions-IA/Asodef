import { Module } from "@nestjs/common";
import { SelfServiceModule } from "../../self-service/self-service.module";
import { BingoAffiliateReadController } from "./bingo-affiliate-read.controller";
import { BingoAffiliateReadService } from "./bingo-affiliate-read.service";

@Module({
  imports: [SelfServiceModule],
  controllers: [BingoAffiliateReadController],
  providers: [BingoAffiliateReadService],
  exports: [BingoAffiliateReadService],
})
export class BingoAffiliateReadModule {}
