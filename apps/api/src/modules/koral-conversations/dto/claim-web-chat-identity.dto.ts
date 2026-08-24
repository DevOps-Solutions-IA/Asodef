import { Equals, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { WEB_CHAT_CONTRACT_VERSION } from "../contracts/web-chat.contract";

export class ClaimWebChatIdentityDto {
  @Equals(WEB_CHAT_CONTRACT_VERSION)
  version!: typeof WEB_CHAT_CONTRACT_VERSION;

  @IsUUID()
  clientClaimId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;
}
