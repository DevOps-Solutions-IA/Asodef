import { IsUUID } from "class-validator";

export class AssignDataSubjectRequestDto {
  @IsUUID("4", { message: "El identificador del usuario asignado no es válido." })
  assignedUserId!: string;
}
