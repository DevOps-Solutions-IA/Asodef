import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import {
  DATA_CLASSIFICATIONS,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_DOMAINS,
  type DataClassification,
  type KnowledgeAudience,
  type KnowledgeDomain,
} from "@asodef/connect-contracts";

export class KnowledgeDraftMetadataDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,99}$/u)
  stableKey?: string;

  @IsOptional()
  @IsUUID()
  knowledgeItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedItemRevision?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsEnum(KNOWLEDGE_DOMAINS)
  domain!: KnowledgeDomain;

  @IsEnum(KNOWLEDGE_AUDIENCES)
  audience!: KnowledgeAudience;

  @IsEnum(DATA_CLASSIFICATIONS)
  classification!: DataClassification;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  language!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  sourceReference!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  sourceOwner!: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsDateString()
  requiresRevalidationAt?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  changeReason!: string;
}

export class CreateManualKnowledgeDto extends KnowledgeDraftMetadataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(262_144)
  content!: string;
}

export class CreateFileKnowledgeDto extends KnowledgeDraftMetadataDto {}

export class KnowledgeLifecycleCommandDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  changeReason!: string;
}

export class KnowledgePreviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  query!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  limit!: number;
}

export class OfficialWebImportDto extends KnowledgeDraftMetadataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  url!: string;
}

export class ListKnowledgeItemsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(KNOWLEDGE_DOMAINS)
  domain?: KnowledgeDomain;

  @IsOptional()
  @IsEnum(KNOWLEDGE_AUDIENCES)
  audience?: KnowledgeAudience;

  @IsOptional()
  @IsEnum(DATA_CLASSIFICATIONS)
  classification?: DataClassification;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 30;
}

export class KnowledgeRetrievalTestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  query!: string;

  @IsArray()
  @IsEnum(KNOWLEDGE_DOMAINS, { each: true })
  domainKeys!: KnowledgeDomain[];

  @IsInt()
  @Min(1)
  @Max(50)
  limit!: number;
}
