import { PublishedTemplateRenderer } from "./published-template.renderer";

describe("PublishedTemplateRenderer", () => {
  const renderer = new PublishedTemplateRenderer();

  it("rejects an unpublished template version", () => {
    expect(() => renderer.render({
      key: "crm_lead_welcome",
      version: 2,
      channel: "EMAIL",
      purpose: "TRANSACTIONAL",
      variables: { fullName: "Person", corporateEmail: "info@example.com" },
    })).toThrow(expect.objectContaining({ code: "TEMPLATE_NOT_PUBLISHED" }));
  });

  it.each([
    ["missing", { fullName: "Person" }],
    ["undeclared", { fullName: "Person", corporateEmail: "info@example.com", extra: "x" }],
    ["header newline", { fullName: "Person", corporateEmail: "info@example.com\nBcc:x" }],
    ["non-string", { fullName: { nested: true }, corporateEmail: "info@example.com" }],
  ])("rejects %s template variables", (_case, variables) => {
    expect(() => renderer.render({
      key: "crm_lead_welcome",
      version: 1,
      channel: "EMAIL",
      purpose: "TRANSACTIONAL",
      variables,
    })).toThrow(expect.objectContaining({ code: "TEMPLATE_VARIABLES_INVALID" }));
  });

  it("rejects placeholder-like input instead of evaluating it as template code", () => {
    expect(() => renderer.render({
      key: "crm_lead_welcome",
      version: 1,
      channel: "EMAIL",
      purpose: "TRANSACTIONAL",
      variables: { fullName: "{{constructor}}", corporateEmail: "info@example.com" },
    })).toThrow(expect.objectContaining({ code: "TEMPLATE_UNSAFE" }));
  });
});
