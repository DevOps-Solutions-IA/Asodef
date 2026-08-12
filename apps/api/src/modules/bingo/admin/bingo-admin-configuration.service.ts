import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import type {
  CreateBingoEventDto,
  CreateBingoPatternDto,
  CreateBingoPrizeDto,
  CreateBingoRoundDto,
  UpdateBingoEventDto,
  UpdateBingoPatternDto,
  UpdateBingoPrizeDto,
  UpdateBingoRoundDto,
} from "../contracts/admin";
import { BingoConfigurationService } from "../application/configuration";
import {
  BingoTransactionKernel,
  PrismaBingoTransactionRunner,
  type CommandContext,
} from "../application/kernel";

type ContextFactory = (command: unknown) => CommandContext;

@Injectable()
export class BingoAdminConfigurationService {
  private readonly service: BingoConfigurationService;

  constructor(prisma: PrismaService) {
    this.service = new BingoConfigurationService(
      new BingoTransactionKernel(new PrismaBingoTransactionRunner(prisma)),
    );
  }

  createEvent(input: CreateBingoEventDto, context: ContextFactory) {
    return this.service.createEvent(input, context(input));
  }
  updateEvent(eventId: string, input: UpdateBingoEventDto, context: ContextFactory) {
    return this.service.updateEvent(eventId, input, context({ eventId, ...input }));
  }
  createRound(eventId: string, input: CreateBingoRoundDto, context: ContextFactory) {
    return this.service.createRound(eventId, input, context({ eventId, ...input }));
  }
  updateRound(eventId: string, roundId: string, input: UpdateBingoRoundDto, context: ContextFactory) {
    return this.service.updateRound(eventId, roundId, input, context({ eventId, roundId, ...input }));
  }
  createPattern(eventId: string, roundId: string, input: CreateBingoPatternDto, context: ContextFactory) {
    return this.service.createPattern(eventId, roundId, input, context({ eventId, roundId, ...input }));
  }
  updatePattern(eventId: string, roundId: string, patternId: string, input: UpdateBingoPatternDto, context: ContextFactory) {
    return this.service.updatePattern(eventId, roundId, patternId, input, context({ eventId, roundId, patternId, ...input }));
  }
  createPrize(eventId: string, roundId: string, input: CreateBingoPrizeDto, context: ContextFactory) {
    return this.service.createPrize(eventId, roundId, input, context({ eventId, roundId, ...input }));
  }
  updatePrize(eventId: string, roundId: string, prizeId: string, input: UpdateBingoPrizeDto, context: ContextFactory) {
    return this.service.updatePrize(eventId, roundId, prizeId, input, context({ eventId, roundId, prizeId, ...input }));
  }
}
