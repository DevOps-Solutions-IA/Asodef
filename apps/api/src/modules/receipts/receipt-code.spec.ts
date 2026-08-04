import { generateReceiptNumber, generateVerificationCode } from "./receipt-code";

describe("generateReceiptNumber", () => {
  it("has the RCP- prefix followed by 10 unambiguous alphanumeric characters", () => {
    const number = generateReceiptNumber();
    expect(number).toMatch(/^RCP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  });

  it("never contains visually-confusable characters (0, O, 1, I)", () => {
    const number = generateReceiptNumber();
    expect(number).not.toMatch(/[01OI]/);
  });

  it("is not deterministic across calls", () => {
    const a = generateReceiptNumber();
    const b = generateReceiptNumber();
    expect(a).not.toBe(b);
  });
});

describe("generateVerificationCode", () => {
  it("is a 12-character uppercase hex string, independent of the receipt number", () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^[A-F0-9]{12}$/);
  });

  it("is not deterministic across calls", () => {
    const a = generateVerificationCode();
    const b = generateVerificationCode();
    expect(a).not.toBe(b);
  });
});
