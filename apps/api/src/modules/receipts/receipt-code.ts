import { randomBytes, randomInt } from "node:crypto";

const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I - avoids misread receipt numbers

function randomAlphanumeric(length: number): string {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += ALPHANUMERIC[randomInt(ALPHANUMERIC.length)];
  }
  return result;
}

/** Non-sequential, cryptographically random - same "never a guessable
 * ordering" rule as PaymentOrder.publicReference (US-023), formatted as
 * a human-readable receipt number rather than a base64url token since
 * this one is meant to be read/typed by a customer. */
export function generateReceiptNumber(): string {
  return `RCP-${randomAlphanumeric(10)}`;
}

/** A shorter, separate code (never derived from receiptNumber) a
 * customer can use to verify a receipt's authenticity independently of
 * its number. */
export function generateVerificationCode(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}
