import { Module } from "@nestjs/common";
import { RetentionReviewController } from "./retention-review.controller";
import { RetentionReviewService } from "./retention-review.service";

@Module({
  controllers: [RetentionReviewController],
  providers: [RetentionReviewService],
})
export class RetentionReviewModule {}
