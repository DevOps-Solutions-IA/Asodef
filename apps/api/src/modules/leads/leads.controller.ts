import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { LeadsService } from "./leads.service";
import { CreateLeadDto } from "./dto/create-lead.dto";

@ApiTags("leads")
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createLead(@Body() dto: CreateLeadDto, @Req() request: AuthenticatedRequest) {
    return this.leadsService.create(dto, buildRequestContext(request));
  }
}
