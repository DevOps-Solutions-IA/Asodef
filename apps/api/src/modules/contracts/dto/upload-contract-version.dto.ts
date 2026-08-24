import { IsOptional, IsString, IsUUID } from "class-validator";

/** The uploaded file itself arrives via multipart (FileInterceptor),
 * not as a DTO field - this only covers the accompanying form fields. */
export class UploadContractVersionDto {
  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsUUID()
  planVersionId?: string;
}
