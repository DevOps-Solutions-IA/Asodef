import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class AddContractSignerDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsEmail()
  email!: string;
}
