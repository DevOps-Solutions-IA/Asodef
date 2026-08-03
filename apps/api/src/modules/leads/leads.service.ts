import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { RateLimiterService } from "../auth/rate-limiter.service";
import type { RequestContext } from "../auth/auth.service";
import type { EnvConfig } from "../../config/env.validation";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { toLeadSubmissionResponse, type LeadSubmissionResponse } from "./leads.types";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Always resolves with a 201-shaped response, even when the submission
   * is rate-limited or honeypot-flagged - a public form must never reveal
   * *why* it silently didn't persist something, the same non-disclosure
   * principle PasswordRecoveryService.forgotPassword already uses (see
   * that class's doc comment). Only a missing/false consentAccepted is
   * ever surfaced as a real 400, since class-validator already rejects
   * that before this method runs.
   */
  async create(dto: CreateLeadDto, context: RequestContext): Promise<LeadSubmissionResponse> {
    // Honeypot: a real visitor never populates this hidden field. Bot
    // traffic gets an indistinguishable success response, but nothing is
    // written - see the DTO's own doc comment.
    if (dto.website) {
      return this.unpersistedResponse(dto);
    }

    const ipLimit = await this.rateLimiterService.checkAndIncrement(
      `leads:ip:${context.ipAddress ?? "unknown"}`,
      this.configService.get("LEADS_RATE_LIMIT_IP_MAX", { infer: true }),
      this.configService.get("LEADS_RATE_LIMIT_IP_WINDOW_SECONDS", { infer: true }),
    );

    if (ipLimit.limited) {
      return this.unpersistedResponse(dto);
    }

    const lead = await this.prisma.leadSubmission.create({
      data: {
        fullName: dto.nombreCompleto,
        company: dto.empresa,
        position: dto.cargo,
        city: dto.ciudad,
        phone: dto.telefono,
        email: dto.correo,
        sector: dto.sector,
        message: dto.mensaje,
        consentAccepted: dto.consentAccepted,
        notification: { create: {} },
      },
    });

    return toLeadSubmissionResponse(lead);
  }

  /** Same shape as a persisted lead's response, built straight from the
   * DTO - used for the honeypot and rate-limited paths, where nothing is
   * ever written to the database. */
  private unpersistedResponse(dto: CreateLeadDto): LeadSubmissionResponse {
    return {
      nombreCompleto: dto.nombreCompleto,
      empresa: dto.empresa,
      cargo: dto.cargo,
      ciudad: dto.ciudad,
      telefono: dto.telefono,
      correo: dto.correo,
      sector: dto.sector,
      mensaje: dto.mensaje,
      consentAccepted: dto.consentAccepted,
      createdAt: new Date(),
    };
  }
}
