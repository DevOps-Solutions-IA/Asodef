import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  nit!: string;

  @IsString()
  @MinLength(1)
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @MinLength(1)
  sector!: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";
}
