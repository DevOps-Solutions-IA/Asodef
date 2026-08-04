import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentOrderStatus, type PaymentOrder, type Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { maskDocumentNumber } from "../payments-lookup/mask-document-number";
import { generateReceiptNumber, generateVerificationCode } from "./receipt-code";
import { getPaymentOrderStatusLabel } from "@asodef/payments";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

export interface ReceiptDetail {
  publicReference: string;
  receiptNumber: string;
  verificationCode: string;
  issuedAt: Date;
  customerFullName: string;
  maskedDocumentNumber: string;
  concept: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  dueDate: Date;
}

@Injectable()
export class PaymentReceiptsService {
  private readonly logger = new Logger(PaymentReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * US-027: called from every place a PaymentOrder's status is actually
   * written (bold-payments.service.ts's create/status-poll, and
   * bold-webhook.service.ts's processDelivery) - never from a route
   * handler directly, so a receipt is only ever issued at the exact
   * moment a transition *into* APPROVED really happens, not on every
   * request that merely observes an already-APPROVED order. Must be
   * called with the same transaction client the status update itself
   * ran in, so the receipt and the status change commit atomically
   * together.
   */
  async issueIfNewlyApproved(tx: Prisma.TransactionClient, previousStatus: PaymentOrderStatus, order: PaymentOrder): Promise<void> {
    if (previousStatus === PaymentOrderStatus.APPROVED || order.status !== PaymentOrderStatus.APPROVED) {
      return;
    }

    // Defensive second check (belt-and-suspenders): even if a caller
    // somehow re-invokes this for an order that already has a receipt,
    // never create a second one.
    const existing = await tx.paymentReceipt.findFirst({ where: { paymentOrderId: order.id } });
    if (existing) {
      return;
    }

    await tx.paymentReceipt.create({
      data: {
        paymentOrderId: order.id,
        receiptNumber: generateReceiptNumber(),
        verificationCode: generateVerificationCode(),
      },
    });
  }

  async getReceiptDetail(publicReference: string): Promise<ReceiptDetail> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { publicReference },
      include: { customer: true, obligation: true, receipts: true },
    });

    const receipt = order?.receipts[0];
    if (!order || !receipt) {
      // Same generic message/shape whether the order doesn't exist or
      // simply has no receipt yet (PENDING/REJECTED/etc.) - no
      // information leakage about order state to an unauthenticated
      // caller (PRD-established convention since US-024).
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    return {
      publicReference: order.publicReference,
      receiptNumber: receipt.receiptNumber,
      verificationCode: receipt.verificationCode,
      issuedAt: receipt.issuedAt,
      customerFullName: order.customer.fullName,
      maskedDocumentNumber: maskDocumentNumber(order.customer.documentNumber),
      concept: order.obligation.concept,
      amountCents: order.amountCents,
      currency: order.currency,
      status: order.status,
      statusLabel: getPaymentOrderStatusLabel(order.status),
      dueDate: order.obligation.dueDate,
    };
  }

  /**
   * Lazily generates the PDF on first request and caches it to disk
   * (PaymentReceipt.pdfPath) - keeps filesystem I/O out of the payment-
   * status transaction entirely; every later request for the same
   * receipt just reads the already-generated file back.
   */
  async getReceiptPdf(publicReference: string): Promise<Buffer> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { publicReference },
      include: { customer: true, obligation: true, receipts: true },
    });
    const receipt = order?.receipts[0];
    if (!order || !receipt) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    if (receipt.pdfPath) {
      try {
        return await readFile(receipt.pdfPath);
      } catch (error) {
        this.logger.warn(
          `Cached receipt PDF for ${publicReference} missing on disk (${(error as Error).message}) - regenerating`,
          PaymentReceiptsService.name,
        );
      }
    }

    const pdfBytes = await this.renderPdf({
      publicReference: order.publicReference,
      receiptNumber: receipt.receiptNumber,
      verificationCode: receipt.verificationCode,
      issuedAt: receipt.issuedAt,
      customerFullName: order.customer.fullName,
      maskedDocumentNumber: maskDocumentNumber(order.customer.documentNumber),
      concept: order.obligation.concept,
      amountCents: order.amountCents,
      currency: order.currency,
      status: order.status,
      statusLabel: getPaymentOrderStatusLabel(order.status),
      dueDate: order.obligation.dueDate,
    });

    const storageDir = resolve(this.configService.get("RECEIPTS_STORAGE_DIR", { infer: true }));
    await mkdir(storageDir, { recursive: true });
    const pdfPath = join(storageDir, `${receipt.receiptNumber}.pdf`);
    await writeFile(pdfPath, pdfBytes);
    await this.prisma.paymentReceipt.update({ where: { id: receipt.id }, data: { pdfPath } });

    return Buffer.from(pdfBytes);
  }

  private async renderPdf(detail: ReceiptDetail): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([420, 560]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const amount = (detail.amountCents / 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let y = 500;
    const line = (text: string, useFont = font, size = 11, gap = 22) => {
      page.drawText(text, { x: 40, y, size, font: useFont, color: rgb(0.02, 0.15, 0.11) });
      y -= gap;
    };

    line("ASODEF S.A.S.", bold, 16, 28);
    line("Comprobante de pago", bold, 13, 26);
    line(`Referencia: ${detail.publicReference}`);
    line(`No. de comprobante: ${detail.receiptNumber}`);
    line(`Código de verificación: ${detail.verificationCode}`);
    line(`Fecha de emisión: ${detail.issuedAt.toISOString().slice(0, 10)}`);
    y -= 10;
    line(`Cliente: ${detail.customerFullName}`);
    line(`Documento: ${detail.maskedDocumentNumber}`);
    y -= 10;
    line(`Concepto: ${detail.concept}`);
    line(`Monto: $${amount} ${detail.currency}`);
    line(`Estado: ${detail.statusLabel}`);

    return doc.save();
  }
}
