import { LEGAL_DOCUMENT_CATALOG } from "../../database/legal-document-catalog";
import { validateLegalContent } from "./legal-content-validator";

describe("validateLegalContent", () => {
  it.each(["LEGAL_CONTENT_PLACEHOLDER", "Pendiente de confirmación legal", "Por definir", "TODO", "Lorem ipsum"])(
    "rejects known placeholder marker %s",
    (marker) => {
      const issues = validateLegalContent({ sections: [{ heading: "Contenido", body: marker }] });
      expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PLACEHOLDER", path: "sections[0].body" })]));
    },
  );

  it("returns every incomplete section in one structured result", () => {
    const issues = validateLegalContent({ sections: [{ heading: "", body: "" }, null] });
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["EMPTY_HEADING", "EMPTY_BODY", "MALFORMED_CONTENT"]));
  });

  it("rejects null approved content", () => {
    expect(validateLegalContent(null, "privacy_policy", true)).toEqual([expect.objectContaining({ code: "NULL_APPROVED_CONTENT" })]);
  });

  it("detects a missing required section for a known document type", () => {
    const issues = validateLegalContent({ sections: [{ heading: "Responsable y contacto", body: "Contenido suficientemente completo para esta sección." }] }, "privacy_policy");
    expect(issues.some((issue) => issue.code === "MISSING_REQUIRED_SECTION")).toBe(true);
  });

  it.each(LEGAL_DOCUMENT_CATALOG)("accepts the complete catalog entry $slug", (entry) => {
    expect(validateLegalContent({ sections: entry.sections }, entry.type)).toEqual([]);
  });
});
