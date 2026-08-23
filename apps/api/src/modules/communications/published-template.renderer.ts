import { Injectable } from "@nestjs/common";
import {
  validateTemplateDefinition,
  type CommunicationPurpose,
  type CommunicationTransport,
} from "@asodef/connect-contracts";
import {
  COMMUNICATION_TEMPLATE_CATALOG,
  COMMUNICATION_TEMPLATE_VERSIONS,
} from "../../database/communication-template-catalog";
import { CommunicationsRuntimeError } from "./communications-runtime.error";

const PLACEHOLDER = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

export interface RenderedPublishedTemplate {
  subject: string | null;
  textBody: string;
  templateReference: string;
}

/**
 * Runtime view over the append-only, hash-pinned template catalog. Only the
 * active pointer is treated as PUBLISHED. No database body, expression,
 * helper, property traversal or executable template language is accepted.
 */
@Injectable()
export class PublishedTemplateRenderer {
  render(input: {
    key: string;
    version: number;
    channel: CommunicationTransport;
    purpose: CommunicationPurpose;
    variables: Readonly<Record<string, unknown>>;
  }): RenderedPublishedTemplate {
    const requestedVersion = `v${input.version}` as const;
    const pointer = COMMUNICATION_TEMPLATE_CATALOG.find(
      (entry) => entry.key === input.key,
    );
    if (!pointer || pointer.activeVersion !== requestedVersion) {
      throw new CommunicationsRuntimeError("TEMPLATE_NOT_PUBLISHED", false);
    }
    const template = COMMUNICATION_TEMPLATE_VERSIONS.find(
      (entry) =>
        entry.key === input.key && entry.version === requestedVersion,
    );
    if (
      !template ||
      template.channel.toUpperCase() !== input.channel ||
      template.kind !== input.purpose
    ) {
      throw new CommunicationsRuntimeError("TEMPLATE_NOT_PUBLISHED", false);
    }

    const definition = validateTemplateDefinition(
      template.requiredVariables,
      template.subject,
      template.body.text,
    );
    if (!definition.valid) {
      throw new CommunicationsRuntimeError("TEMPLATE_UNSAFE", false);
    }

    const provided = Object.keys(input.variables).sort();
    const expected = [...template.requiredVariables].sort();
    if (
      provided.length !== expected.length ||
      provided.some((name, index) => name !== expected[index]) ||
      provided.some((name) => {
        const value = input.variables[name];
        return (
          typeof value !== "string" ||
          value.trim().length === 0 ||
          /[\r\n]/.test(value)
        );
      })
    ) {
      throw new CommunicationsRuntimeError(
        "TEMPLATE_VARIABLES_INVALID",
        false,
      );
    }

    const render = (value: string): string =>
      value.replace(PLACEHOLDER, (_match, variable: string) => {
        const replacement = input.variables[variable];
        if (typeof replacement !== "string") {
          throw new CommunicationsRuntimeError(
            "TEMPLATE_VARIABLES_INVALID",
            false,
          );
        }
        return replacement;
      });
    const subject = template.subject ? render(template.subject) : null;
    const textBody = render(template.body.text);
    PLACEHOLDER.lastIndex = 0;
    if (
      (subject && PLACEHOLDER.test(subject)) ||
      PLACEHOLDER.test(textBody)
    ) {
      throw new CommunicationsRuntimeError("TEMPLATE_UNSAFE", false);
    }
    return {
      subject,
      textBody,
      templateReference: `${template.key}@${template.version}`,
    };
  }
}
