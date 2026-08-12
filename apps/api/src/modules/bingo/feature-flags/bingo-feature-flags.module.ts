import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { BingoFeatureFlagGuard, BingoFeatureFlagsService } from "./bingo-feature-flags";

@Module({
  imports: [ConfigModule],
  providers: [BingoFeatureFlagsService, BingoFeatureFlagGuard],
  exports: [BingoFeatureFlagsService, BingoFeatureFlagGuard],
})
export class BingoFeatureFlagsModule {}
