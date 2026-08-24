import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class WebChatHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  cursor?: string;
}
