import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { buildRequestContext } from "../../common/http/request-context.util";
import { ContractsService } from "./contracts.service";
import { CreateContractDto } from "./dto/create-contract.dto";
import { UploadContractVersionDto } from "./dto/upload-contract-version.dto";
import { AddContractSignerDto } from "./dto/add-contract-signer.dto";
import { RecordContractAcceptanceDto } from "./dto/record-contract-acceptance.dto";
import { TransitionContractDto } from "./dto/transition-contract.dto";

@ApiTags("contracts")
@Controller()
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.manage")
  @Post("admin/contracts")
  @HttpCode(HttpStatus.CREATED)
  createContract(@Body() dto: CreateContractDto) {
    return this.contractsService.createContract(dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.read")
  @Get("admin/contracts")
  listContracts() {
    return this.contractsService.listContracts();
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.read")
  @Get("admin/contracts/:id")
  getContract(@Param("id", ParseUUIDPipe) id: string) {
    return this.contractsService.getContract(id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.manage")
  @Post("admin/contracts/:id/versions")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  uploadVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadContractVersionDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.contractsService.uploadVersion(id, file, dto, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.manage")
  @Post("admin/contracts/:id/transition")
  @HttpCode(HttpStatus.OK)
  transition(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TransitionContractDto) {
    return this.contractsService.transition(id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.manage")
  @Post("admin/contract-versions/:id/signers")
  @HttpCode(HttpStatus.CREATED)
  addSigner(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AddContractSignerDto) {
    return this.contractsService.addSigner(id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.manage")
  @Post("admin/contract-versions/:id/acceptances")
  @HttpCode(HttpStatus.CREATED)
  recordAcceptance(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RecordContractAcceptanceDto, @Req() request: AuthenticatedRequest) {
    const context = buildRequestContext(request);
    return this.contractsService.recordAcceptance(id, dto, context.ipAddress ?? null);
  }

  // AC: "download requires an authenticated, permission-checked,
  // time-limited signed URL (contracts.read permission)" - this step
  // is exactly that check; the actual file transfer happens through
  // the public, token-authenticated route below.
  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.read")
  @Post("admin/contract-versions/:id/download-url")
  @HttpCode(HttpStatus.OK)
  createDownloadUrl(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser) {
    return this.contractsService.createDownloadUrl(id, actor.id);
  }

  // No `passthrough: true` here deliberately: mixing it with a
  // returned value would have Nest's own pipeline JSON-serialize the
  // Buffer (as {"type":"Buffer","data":[...]}) instead of sending raw
  // bytes - res.send() must own the response entirely.
  @Public()
  @Get("contracts/downloads/:token")
  async download(@Param("token") token: string, @Res() res: Response) {
    const { buffer, checksum, contractId } = await this.contractsService.resolveDownload(token);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${contractId}.bin"`);
    res.setHeader("X-Content-Checksum", checksum);
    res.send(buffer);
  }
}
