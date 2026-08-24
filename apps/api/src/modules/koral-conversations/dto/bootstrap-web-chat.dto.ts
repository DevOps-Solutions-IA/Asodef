import { Equals } from "class-validator";
import { WEB_CHAT_CONTRACT_VERSION } from "../contracts/web-chat.contract";

export class BootstrapWebChatDto {
  @Equals(WEB_CHAT_CONTRACT_VERSION)
  version!: typeof WEB_CHAT_CONTRACT_VERSION;
}
