import { Equals, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { WEB_CHAT_CONTRACT_VERSION } from "../contracts/web-chat.contract";

class WebChatTextContentDto {
  @Equals("text/plain")
  type!: "text/plain";

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  body!: string;
}

export class SendWebChatMessageDto {
  @Equals(WEB_CHAT_CONTRACT_VERSION)
  version!: typeof WEB_CHAT_CONTRACT_VERSION;

  @IsUUID()
  clientMessageId!: string;

  @ValidateNested()
  @Type(() => WebChatTextContentDto)
  content!: WebChatTextContentDto;
}
