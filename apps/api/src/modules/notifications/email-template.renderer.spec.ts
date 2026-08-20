import {
  COMMUNICATION_TEMPLATE_CATALOG,
  COMMUNICATION_TEMPLATE_VERSIONS,
  TEMPLATE_CONTENT_HASHES,
  computeCommunicationTemplateContentHash,
  resolveActiveCommunicationTemplate,
} from "../../database/communication-template-catalog";
import { EmailTemplateRenderError, EmailTemplateRenderer } from "./email-template.renderer";

describe("EmailTemplateRenderer", () => {
  const renderer = new EmailTemplateRenderer();

  it("contains the required enterprise foundation as unique source-controlled versions", () => {
    const requiredKeys = [
      "security_password_recovery",
      "security_mfa_notice",
      "security_session_revoked",
      "crm_lead_welcome",
      "crm_followup_1",
      "contract_expiring",
      "pqr_received",
      "data_request_received",
    ];
    const keys = COMMUNICATION_TEMPLATE_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(requiredKeys));
    expect(COMMUNICATION_TEMPLATE_CATALOG.every((entry) => /^v\d+$/.test(entry.activeVersion))).toBe(true);
  });

  it("pins every append-only version to explicit content integrity metadata", () => {
    const ids = COMMUNICATION_TEMPLATE_VERSIONS.map((entry) => `${entry.key}@${entry.version}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(TEMPLATE_CONTENT_HASHES).sort()).toEqual([...ids].sort());
    for (const template of COMMUNICATION_TEMPLATE_VERSIONS) {
      expect(template.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(computeCommunicationTemplateContentHash(template)).toBe(template.contentHash);
    }
  });

  it("resolves every active pointer to exactly one integrity-verified version", () => {
    for (const pointer of COMMUNICATION_TEMPLATE_CATALOG) {
      const template = resolveActiveCommunicationTemplate(pointer.key);
      expect(template.key).toBe(pointer.key);
      expect(template.version).toBe(pointer.activeVersion);
    }
  });

  it("renders the password recovery template without exposing unresolved placeholders", () => {
    const rendered = renderer.render("security_password_recovery", {
      resetUrl: "https://example.test/reset?token=opaque-test-token",
      corporateEmail: "info@asodef.com.co",
    });
    expect(rendered.templateVersion).toBe("security_password_recovery@v1");
    expect(rendered.subject).toBe("Restablece tu contraseña - ASODEF");
    expect(rendered.textBody).toContain("opaque-test-token");
    expect(rendered.textBody).not.toMatch(/{{|}}/);
  });

  it("fails closed for missing, extra, non-string, empty, or multiline variables", () => {
    for (const variables of [
      { resetUrl: "https://example.test/reset" },
      { resetUrl: "https://example.test/reset", corporateEmail: "info@asodef.com.co", extra: "no" },
      { resetUrl: 123, corporateEmail: "info@asodef.com.co" },
      { resetUrl: "   ", corporateEmail: "info@asodef.com.co" },
      { resetUrl: "https://example.test/reset\r\nBcc: attacker@example.test", corporateEmail: "info@asodef.com.co" },
    ]) {
      expect(() => renderer.render("security_password_recovery", variables)).toThrow(
        expect.objectContaining<Partial<EmailTemplateRenderError>>({ code: "TEMPLATE_VARIABLES_INVALID" }),
      );
    }
  });

  it("rejects placeholder injection through a variable", () => {
    expect(() => renderer.render("crm_lead_welcome", {
      fullName: "{{evil}}",
      corporateEmail: "info@asodef.com.co",
    })).toThrow(expect.objectContaining<Partial<EmailTemplateRenderError>>({ code: "TEMPLATE_INVALID" }));
  });

  it("can render every catalog entry with exactly its declared variables", () => {
    for (const pointer of COMMUNICATION_TEMPLATE_CATALOG) {
      const template = resolveActiveCommunicationTemplate(pointer.key);
      const variables = Object.fromEntries(template.requiredVariables.map((name) => [name, `safe-${name}`]));
      const rendered = renderer.render(pointer.key, variables);
      expect(rendered.templateVersion).toBe(`${template.key}@${template.version}`);
      expect(`${rendered.subject}\n${rendered.textBody}`).not.toMatch(/{{|}}/);
    }
  });
});
