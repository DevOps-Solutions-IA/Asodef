/** Minimal shape any domain service needs from an uploaded multipart
 * file - deliberately not `Express.Multer.File` itself, so services
 * stay decoupled from the HTTP/multer layer (matches the interface
 * pattern already used for BoldTransport/MailTransport in this
 * codebase). Shared across domains (contracts, refunds) rather than
 * each redefining an identical shape. */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}
