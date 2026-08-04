import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentReceiptsService } from "./payment-receipts.service";

@ApiTags("receipts")
@Controller("receipts")
export class ReceiptsController {
  constructor(private readonly paymentReceiptsService: PaymentReceiptsService) {}

  @Public()
  @Get(":reference")
  async getReceipt(
    @Param("reference") reference: string,
    @Query("format") format: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const wantsPdf = format === "pdf" || (req.headers.accept?.includes("application/pdf") ?? false);

    if (wantsPdf) {
      const pdf = await this.paymentReceiptsService.getReceiptPdf(reference);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${reference}.pdf"`);
      res.send(pdf);
      return;
    }

    return this.paymentReceiptsService.getReceiptDetail(reference);
  }
}
