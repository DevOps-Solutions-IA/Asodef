import { Module } from "@nestjs/common";

import { BingoAdminModule } from "./admin";
import { BingoAffiliateReadModule } from "./affiliate";
import { BingoFeatureFlagsModule } from "./feature-flags";
import { BingoPublicReadModule } from "./public";
import { BingoRealtimeModule } from "./realtime";

/**
 * Native Bingo composition root. Every externally reachable surface remains
 * fail-closed behind its validated feature flag; importing this module does
 * not enable Bingo by itself.
 */
@Module({
  imports: [
    BingoFeatureFlagsModule,
    BingoAdminModule,
    BingoAffiliateReadModule,
    BingoPublicReadModule,
    BingoRealtimeModule,
  ],
})
export class BingoModule {}
