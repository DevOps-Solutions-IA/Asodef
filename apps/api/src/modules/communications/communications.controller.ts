import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { NotificationService } from "../notifications/notification.service";
import { UnsubscribeDto } from "./dto/unsubscribe.dto";

const DEFAULT_UNSUBSCRIBE_REASON = "Solicitud de baja del usuario.";

@ApiTags("communications")
@Controller("communications")
export class CommunicationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Public()
  @Post("unsubscribe")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@Body() dto: UnsubscribeDto): Promise<void> {
    await this.notificationService.unsubscribe(dto.channel, dto.recipient, dto.reason ?? DEFAULT_UNSUBSCRIBE_REASON);
  }
}
