import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf-8");

// US-043 correction: this test originally scanned the *entire* schema
// file, including domains that have nothing to do with payments - once
// LegalDocumentVersion's own (PRD-literal) expirationDate field existed
// (a legal document's validity period, not a payment card's), the old
// whole-file scan started flagging it as a false positive. "Expiration
// date" is a completely ordinary phrase outside the card-data context;
// the forbidden-pattern check now only ever looks inside the specific
// payments-domain models it's actually meant to guard, not the whole
// schema.
const PAYMENTS_DOMAIN_MODELS = ["Customer", "Obligation", "PaymentOrder", "PaymentAttempt", "PaymentTransaction", "PaymentEvent", "PaymentReceipt"];

function extractModelBody(modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!match) {
    throw new Error(`Test setup error: model "${modelName}" was not found in schema.prisma`);
  }
  return match[1]!;
}

describe("Payments domain never models card data (US-021/US-022: ASODEF never stores PAN/CVV/expiry/cardholder data)", () => {
  it("no payments-domain model contains a card-data field name", () => {
    const forbiddenPatterns = [/\bpan\b/i, /\bcvv\b/i, /\bcvc\b/i, /card.?number/i, /cardholder/i, /expir(y|ation).?(date|month|year)/i];
    for (const modelName of PAYMENTS_DOMAIN_MODELS) {
      const body = extractModelBody(modelName);
      for (const pattern of forbiddenPatterns) {
        expect(body).not.toMatch(pattern);
      }
    }
  });

  it("PaymentTransaction only stores a provider-issued id, status, and the opaque raw response - no payment-instrument fields", () => {
    const match = /model PaymentTransaction \{([\s\S]*?)\n\}/.exec(schema);
    expect(match).not.toBeNull();
    const body = match![1]!;

    expect(body).toMatch(/boldTransactionId/);
    expect(body).toMatch(/rawResponse\s+Json/);
    expect(body).not.toMatch(/card|pan|cvv|cvc/i);
  });
});
