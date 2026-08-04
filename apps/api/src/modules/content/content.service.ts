import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { toContentEntryResponse, type ContentEntryResponse } from "./content.types";

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only PUBLISHED entries - DRAFT rows are never exposed publicly. */
  async findAllPublished(): Promise<ContentEntryResponse[]> {
    const entries = await this.prisma.contentEntry.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { key: "asc" },
    });
    return entries.map(toContentEntryResponse);
  }
}
