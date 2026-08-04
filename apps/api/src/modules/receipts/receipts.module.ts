import { Module } from "@nestjs/common";
import { ReceiptsController } from "./receipts.controller";
import { PaymentReceiptsService } from "./payment-receipts.service";

@Module({
  controllers: [ReceiptsController],
  providers: [PaymentReceiptsService],
  exports: [PaymentReceiptsService],
})
export class ReceiptsModule {}
