import { Injectable } from "@nestjs/common";
import {
  COMMUNICATION_TEMPLATE_CATALOG,
  resolveActiveCommunicationTemplate,
  type CommunicationTemplateVersion,
} from "../../database/communication-template-catalog";

const PLACEHOLDER = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

export type EmailTemplateKey = (typeof COMMUNICATION_TEMPLATE_CATALOG)[number]["key"];

export interface RenderedEmailTemplate {
  subject: string;
  textBody: string;
  templateVersion: string;
}

export class EmailTemplateRenderError extends Error {
  constructor(readonly code: "TEMPLATE_NOT_FOUND" | "TEMPLATE_INVALID" | "TEMPLATE_VARIABLES_INVALID") {
    super(code);
    this.name = "EmailTemplateRenderError";
  }
}

/**
 * Strict plain-text renderer for source-controlled transactional templates.
 * It accepts exactly the declared non-empty, single-line variables and
 * rejects unresolved or injected tokens. Single-line variables also make a
 * future catalog subject interpolation fail closed against header injection.
 * Rendered content is never logged and is encrypted before outbox storage.
 */
@Injectable()
export class EmailTemplateRenderer {
  render(key: EmailTemplateKey, variables: Record<string, unknown>): RenderedEmailTemplate {
    let template: CommunicationTemplateVersion;
    try {
      template = resolveActiveCommunicationTemplate(key);
    } catch {
      throw new EmailTemplateRenderError("TEMPLATE_INVALID");
    }
    if (template.channel !== "email" || !template.subject) {
      throw new EmailTemplateRenderError("TEMPLATE_NOT_FOUND");
    }
    this.validateVariables(template, variables);

    const renderText = (value: string): string => value.replace(PLACEHOLDER, (_match, variable: string) => {
      const replacement = variables[variable];
      if (typeof replacement !== "string") throw new EmailTemplateRenderError("TEMPLATE_VARIABLES_INVALID");
      return replacement;
    });
    const subject = renderText(template.subject);
    const textBody = renderText(template.body.text);
    PLACEHOLDER.lastIndex = 0;
    if (PLACEHOLDER.test(subject) || PLACEHOLDER.test(textBody)) {
      throw new EmailTemplateRenderError("TEMPLATE_INVALID");
    }
    return { subject, textBody, templateVersion: `${template.key}@${template.version}` };
  }

  private validateVariables(
    template: CommunicationTemplateVersion,
    variables: Record<string, unknown>,
  ): void {
    const expected = new Set(template.requiredVariables);
    const provided = Object.keys(variables);
    if (
      provided.length !== expected.size ||
      provided.some((name) => !expected.has(name)) ||
      template.requiredVariables.some((name) => {
        const value = variables[name];
        return typeof value !== "string" || value.trim().length === 0 || /[\r\n]/.test(value);
      })
    ) {
      throw new EmailTemplateRenderError("TEMPLATE_VARIABLES_INVALID");
    }
  }
}
