import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf-8");

describe("Payments domain never models card data (US-021/US-022: ASODEF never stores PAN/CVV/expiry/cardholder data)", () => {
  it("the Prisma schema contains no card-data field names anywhere", () => {
    const forbiddenPatterns = [/\bpan\b/i, /\bcvv\b/i, /\bcvc\b/i, /card.?number/i, /cardholder/i, /expir(y|ation).?(date|month|year)/i];
    for (const pattern of forbiddenPatterns) {
      expect(schema).not.toMatch(pattern);
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
