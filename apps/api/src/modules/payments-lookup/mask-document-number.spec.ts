import { maskDocumentNumber } from "./mask-document-number";

describe("maskDocumentNumber (PRD rule: show only last 4 digits)", () => {
  it("masks all but the last 4 characters for a typical document number", () => {
    expect(maskDocumentNumber("1000000001")).toBe("••••••0001");
  });

  it("masks all but the last 4 for a short-ish number", () => {
    expect(maskDocumentNumber("12345")).toBe("•2345");
  });

  it("masks all but the last character for a number with 4 or fewer characters", () => {
    expect(maskDocumentNumber("1234")).toBe("•••4");
    expect(maskDocumentNumber("12")).toBe("•2");
  });

  it("never returns the original number unmasked", () => {
    const original = "9999999999";
    expect(maskDocumentNumber(original)).not.toBe(original);
  });
});
