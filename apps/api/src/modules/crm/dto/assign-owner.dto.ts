import { IsDefined, IsISO8601, IsUUID, ValidateIf } from "class-validator";

export class AssignOwnerDto {
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  assignedUserId!: string | null;

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
