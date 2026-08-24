import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ConflictException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ContractStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import type { UploadedFile } from "../../common/http/uploaded-file.type";
import { ContractDownloadTokenService } from "./contract-download-token.service";
import type { CreateContractDto } from "./dto/create-contract.dto";
import type { UploadContractVersionDto } from "./dto/upload-contract-version.dto";
import type { AddContractSignerDto } from "./dto/add-contract-signer.dto";
import type { RecordContractAcceptanceDto } from "./dto/record-contract-acceptance.dto";
import type { TransitionContractDto } from "./dto/transition-contract.dto";
import { PlansService } from "../plans/plans.service";
import {
  toAdminContractAcceptanceResponse,
  toAdminContractResponse,
  toAdminContractSignerResponse,
  toAdminContractVersionResponse,
  type AdminContractAcceptanceResponse,
  type AdminContractResponse,
  type AdminContractSignerResponse,
  type AdminContractVersionResponse,
} from "./contracts.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly downloadTokenService: ContractDownloadTokenService,
    private readonly plansService: PlansService,
  ) {}

  async createContract(dto: CreateContractDto): Promise<AdminContractResponse> {
    const contract = await this.prisma.contract.create({
      data: {
        type: dto.type,
        relatedCompanyId: dto.relatedCompanyId,
        relatedCustomerId: dto.relatedCustomerId,
        internalReference: dto.internalReference,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
        notes: dto.notes,
      },
    });
    return toAdminContractResponse(contract);
  }

  async getContract(id: string): Promise<AdminContractResponse> {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminContractResponse(contract);
  }

  async listContracts(): Promise<AdminContractResponse[]> {
    const contracts = await this.prisma.contract.findMany({ orderBy: { createdAt: "desc" } });
    return contracts.map(toAdminContractResponse);
  }

  /**
   * Stores the uploaded document outside any public web root
   * (CONTRACTS_STORAGE_DIR) and records it as a new ContractVersion,
   * becoming the contract's currentVersion. Does not itself change
   * contract.status - only recordAcceptance() drives the one status
   * transition this story's AC actually specifies.
   */
  async uploadVersion(contractId: string, file: UploadedFile, dto: UploadContractVersionDto, actorUserId: string): Promise<AdminContractVersionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      if (dto.planVersionId) await this.plansService.assertContractSelectable(tx, dto.planVersionId);

      const latest = await tx.contractVersion.findFirst({ where: { contractId }, orderBy: { version: "desc" } });
      const nextVersion = (latest?.version ?? 0) + 1;
      const checksum = createHash("sha256").update(file.buffer).digest("hex");

      const storageDir = resolve(this.configService.get("CONTRACTS_STORAGE_DIR", { infer: true }));
      await mkdir(storageDir, { recursive: true });
      const documentPath = join(storageDir, `${contractId}-v${nextVersion}`);
      await writeFile(documentPath, file.buffer);

      const version = await tx.contractVersion.create({
        data: {
          contractId,
          version: nextVersion,
          documentPath,
          checksum,
          changeSummary: dto.changeSummary,
          createdByUserId: actorUserId,
          planVersionId: dto.planVersionId,
        },
      });

      await tx.contract.update({ where: { id: contractId }, data: { currentVersionId: version.id } });

      return toAdminContractVersionResponse(version);
    });
  }

  async addSigner(contractVersionId: string, dto: AddContractSignerDto): Promise<AdminContractSignerResponse> {
    const version = await this.prisma.contractVersion.findUnique({ where: { id: contractVersionId } });
    if (!version) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const signer = await this.prisma.contractSigner.create({
      data: { contractVersionId, fullName: dto.fullName, role: dto.role, email: dto.email },
    });
    return toAdminContractSignerResponse(signer);
  }

  async listSigners(contractVersionId: string): Promise<AdminContractSignerResponse[]> {
    const signers = await this.prisma.contractSigner.findMany({ where: { contractVersionId } });
    return signers.map(toAdminContractSignerResponse);
  }

  /**
   * Example (AC): recording the final required acceptance transitions
   * PENDING_ACCEPTANCE -> ACTIVE. Negative case (implicit in the AC's
   * own wording, "requires the contract to be in PENDING_ACCEPTANCE"):
   * any other contract status rejects with 409.
   */
  async recordAcceptance(
    contractVersionId: string,
    dto: RecordContractAcceptanceDto,
    ipAddress: string | null,
  ): Promise<AdminContractAcceptanceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.contractVersion.findUnique({ where: { id: contractVersionId }, include: { contract: true } });
      if (!version) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }
      if (version.contract.status !== ContractStatus.PENDING_ACCEPTANCE) {
        throw new ConflictException("Solo se pueden registrar aceptaciones cuando el contrato está en pending_acceptance.");
      }
      if (version.contract.currentVersionId !== version.id) {
        throw new ConflictException("Solo se pueden registrar aceptaciones sobre la versión vigente del contrato.");
      }

      const signer = await tx.contractSigner.findUnique({ where: { id: dto.signerId } });
      if (!signer || signer.contractVersionId !== contractVersionId) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const acceptance = await tx.contractAcceptance.create({
        data: {
          contractVersionId,
          signerId: dto.signerId,
          ipAddress,
          evidenceReference: dto.evidenceReference,
        },
      });

      const [signerCount, acceptanceCount] = await Promise.all([
        tx.contractSigner.count({ where: { contractVersionId } }),
        tx.contractAcceptance.count({ where: { contractVersionId } }),
      ]);

      let contractStatus: string = version.contract.status;
      if (signerCount > 0 && acceptanceCount >= signerCount) {
        const updated = await tx.contract.update({ where: { id: version.contractId }, data: { status: ContractStatus.ACTIVE } });
        contractStatus = updated.status;
      }

      return toAdminContractAcceptanceResponse(acceptance, contractStatus);
    });
  }

  /**
   * Free transition between the 7 known statuses, mirroring
   * Opportunity.changeStage()'s "no invented adjacency table" - except
   * ACTIVE, which this AC explicitly reserves for recordAcceptance()
   * alone ("moves to ACTIVE once all required signers have accepted").
   */
  async transition(contractId: string, dto: TransitionContractDto): Promise<AdminContractResponse> {
    if (dto.status === ContractStatus.ACTIVE) {
      throw new ConflictException("El estado active solo se alcanza registrando todas las aceptaciones requeridas.");
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.contract.update({ where: { id: contractId }, data: { status: dto.status } });
    return toAdminContractResponse(updated);
  }

  /** Issues a signed, time-limited download token - requires
   * contracts.read at the controller level. The token itself (not this
   * call) is what the actual download endpoint checks. */
  async createDownloadUrl(contractVersionId: string, actorUserId: string): Promise<{ token: string; expiresAt: Date }> {
    const version = await this.prisma.contractVersion.findUnique({ where: { id: contractVersionId } });
    if (!version) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const { token, rawToken } = await this.downloadTokenService.createToken(contractVersionId, actorUserId);
    return { token: rawToken, expiresAt: token.expiresAt };
  }

  /** Negative case (AC): an expired token returns 410, not 404/403 -
   * distinguishing "this link existed but is no longer valid" from
   * "this link never existed". */
  async resolveDownload(rawToken: string): Promise<{ buffer: Buffer; checksum: string; contractId: string }> {
    const token = await this.downloadTokenService.findByRawToken(rawToken);
    if (!token) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    if (this.downloadTokenService.isExpired(token)) {
      throw new GoneException("Este enlace de descarga ha expirado.");
    }

    const version = await this.prisma.contractVersion.findUniqueOrThrow({ where: { id: token.contractVersionId } });
    const buffer = await readFile(version.documentPath);
    return { buffer, checksum: version.checksum, contractId: version.contractId };
  }
}
