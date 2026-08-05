import { Module } from "@nestjs/common";
import { LegalDocumentsModule } from "../legal-documents/legal-documents.module";
import { ConsentModule } from "../consent/consent.module";
import { CookieConsentController } from "./cookie-consent.controller";
import { CookieConsentService } from "./cookie-consent.service";

@Module({
  imports: [LegalDocumentsModule, ConsentModule],
  controllers: [CookieConsentController],
  providers: [CookieConsentService],
})
export class CookieConsentModule {}
