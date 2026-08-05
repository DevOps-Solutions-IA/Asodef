import { IsString, MinLength } from "class-validator";

export class ExecuteRetentionActionDto {
  /** Required, human-supplied justification - stored verbatim on
   * AnonymizationLog.reason as the durable evidence of why this
   * specific action was approved. */
  @IsString()
  @MinLength(1, { message: "El motivo es requerido para ejecutar una acción de retención." })
  reason!: string;
}
