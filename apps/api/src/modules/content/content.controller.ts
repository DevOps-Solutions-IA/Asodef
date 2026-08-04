import { Controller, Get, Header } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { ContentService } from "./content.service";

@ApiTags("content")
@Controller("content")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  /** GET-only, no side effects, published content only - safe to
   * cache briefly. A short max-age keeps "change a value, reload, see
   * it" (the story's own example) working within a reasonable window
   * while still being cacheable, per the story's own requirement. */
  @Public()
  @Get()
  @Header("Cache-Control", "public, max-age=30")
  findAllPublished() {
    return this.contentService.findAllPublished();
  }
}
