import { createHash } from "node:crypto";

export interface CommunicationTemplateVersionDefinition {
  key: string;
  version: `v${number}`;
  channel: string;
  kind: "TRANSACTIONAL" | "MARKETING";
  subject: string | null;
  requiredVariables: readonly string[];
  body: { text: string };
}

export interface CommunicationTemplateVersion extends CommunicationTemplateVersionDefinition {
  contentHash: `sha256:${string}`;
}

export interface CommunicationTemplateCatalogEntry {
  key: string;
  activeVersion: `v${number}`;
}

const VERSION_DEFINITIONS = [
  {
    key: "security_password_recovery",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Restablece tu contraseña - ASODEF",
    requiredVariables: ["resetUrl", "corporateEmail"],
    body: { text: [
      "Hemos recibido una solicitud para restablecer tu contraseña en ASODEF.",
      "Si fuiste tú, continúa en este enlace: {{resetUrl}}",
      "Este enlace expira pronto y solo puede usarse una vez.",
      "Si no solicitaste este cambio, puedes ignorar este mensaje.",
      "¿Dudas? Escríbenos a {{corporateEmail}}.",
    ].join("\n\n") },
  },
  {
    key: "security_mfa_notice",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Cambio de seguridad MFA - ASODEF",
    requiredVariables: ["corporateEmail"],
    body: { text: "Se registró un cambio en la autenticación multifactor de tu cuenta. Si no lo reconoces, comunícate de inmediato con {{corporateEmail}}." },
  },
  {
    key: "security_session_revoked",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Sesión administrativa revocada - ASODEF",
    requiredVariables: ["corporateEmail"],
    body: { text: "Una sesión administrativa fue revocada. Si no reconoces esta acción, comunícate de inmediato con {{corporateEmail}}." },
  },
  {
    key: "crm_lead_welcome",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Recibimos tu solicitud - ASODEF",
    requiredVariables: ["fullName", "corporateEmail"],
    body: { text: "Hola {{fullName}}, recibimos tu solicitud. Si necesitas información adicional, escríbenos a {{corporateEmail}}." },
  },
  {
    key: "crm_followup_1",
    version: "v1",
    channel: "email",
    kind: "MARKETING",
    subject: "Seguimiento de tu solicitud - ASODEF",
    requiredVariables: ["fullName", "corporateEmail"],
    body: { text: "Hola {{fullName}}, queremos acompañarte con tu solicitud. Puedes contactarnos en {{corporateEmail}}." },
  },
  {
    key: "contract_expiring",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Información sobre tu contrato - ASODEF",
    requiredVariables: ["contractReference", "expiryDate", "corporateEmail"],
    body: { text: "El contrato {{contractReference}} registra la fecha {{expiryDate}} para revisión. Si tienes dudas, escríbenos a {{corporateEmail}}." },
  },
  {
    key: "pqr_received",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Recibimos tu PQR - ASODEF",
    requiredVariables: ["caseReference", "corporateEmail"],
    body: { text: "Recibimos tu PQR con referencia {{caseReference}}. Conserva esta referencia. Si necesitas ayuda, escríbenos a {{corporateEmail}}." },
  },
  {
    key: "data_request_received",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Recibimos tu solicitud de datos - ASODEF",
    requiredVariables: ["requestReference", "corporateEmail"],
    body: { text: "Recibimos tu solicitud con referencia {{requestReference}}. Conserva esta referencia. Si necesitas ayuda, escríbenos a {{corporateEmail}}." },
  },
  {
    key: "security_password_changed",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Tu contraseña fue modificada - ASODEF",
    requiredVariables: ["corporateEmail"],
    body: { text: "Tu contraseña en ASODEF fue modificada correctamente.\n\nSi no reconoces este cambio, contáctanos de inmediato.\n\n¿Dudas? Escríbenos a {{corporateEmail}}." },
  },
  {
    key: "security_account_invitation",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Bienvenido a ASODEF - configura tu contraseña",
    requiredVariables: ["fullName", "setupUrl", "corporateEmail"],
    body: { text: "Hola {{fullName}},\n\nSe creó una cuenta para ti en la plataforma administrativa de ASODEF.\n\nPara activarla, configura tu contraseña aquí: {{setupUrl}}\n\nEste enlace expira pronto y solo puede usarse una vez.\n\n¿Dudas? Escríbenos a {{corporateEmail}}." },
  },
  {
    key: "payment_result",
    version: "v1",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Resultado de tu pago - ASODEF",
    requiredVariables: [],
    body: { text: "Te informamos el resultado de tu pago." },
  },
  {
    key: "general_marketing",
    version: "v1",
    channel: "email",
    kind: "MARKETING",
    subject: "Novedades de ASODEF",
    requiredVariables: [],
    body: { text: "Conoce las últimas novedades de ASODEF." },
  },
] as const satisfies readonly CommunicationTemplateVersionDefinition[];

/**
 * Version-store contract (intentionally no migration 41): definitions above
 * are append-only and their Git history is the authoritative archive. Change
 * content by adding v2 and moving the separate active pointer below; never
 * edit or remove v1. NotificationJob stores both `key@version` and the fully
 * rendered encrypted payload, so an already-queued retry remains byte-stable
 * even after the active pointer advances. The database template row is only
 * an operational projection of the active version, not the history store.
 *
 * Explicit integrity pins for every immutable source-controlled version.
 * Changing content in-place without adding a new version and hash causes
 * renderer/seed startup paths and catalog tests to fail closed.
 */
export const TEMPLATE_CONTENT_HASHES: Readonly<Record<string, `sha256:${string}`>> = {
  "security_password_recovery@v1": "sha256:91b5897ba782bc19a66c09b1e4312ce5a921839376badcd91ad11562921fbbe6",
  "security_mfa_notice@v1": "sha256:0b430d9f6161d9466b556b1196cbb1bc199b4e12ab736704d26fd671d740f35d",
  "security_session_revoked@v1": "sha256:5b881ed4e69ce96959aaca5f8012e7b2b9b8959c09daca11a264911cd7c01fe2",
  "crm_lead_welcome@v1": "sha256:a70dcdce1be43b8d032aaa5b9ffc5ae9e8fe3d44663dd39aa8a81dd9dafcbad6",
  "crm_followup_1@v1": "sha256:0ee8592eb663328f37c8bd4fda5b2e3d496b82a13afb4de62304dda2e69ab451",
  "contract_expiring@v1": "sha256:cf2f0e0ae70c178b4300c5c08e5534ea3ef46a9d876da615d08e0014bf991ec6",
  "pqr_received@v1": "sha256:14839e1cd10b1754b9bc39d41a0876ad13e9b65608f398c1435f08632a231878",
  "data_request_received@v1": "sha256:891beddb430f34a67a1c48a8300196e4c58455e726bb6c994e770cf0f4d8a82e",
  "security_password_changed@v1": "sha256:f7f2f6901ff05aacc95efd4f2145b618af529ed9999f5a89e55daf431f62c351",
  "security_account_invitation@v1": "sha256:f6a97e881307660d4bf255e4599633546b0bd2e17d19e4d286f4d2e09271950a",
  "payment_result@v1": "sha256:9cb9b39f646daf3cb86e91ef895f78133e2b2fc9eedef6bb92fccd4bd94936f5",
  "general_marketing@v1": "sha256:2d092bef7a3fdc99a95260f264e046446122fc9027c75b6180ac2a2429c734f2",
};

export const COMMUNICATION_TEMPLATE_VERSIONS: readonly CommunicationTemplateVersion[] = VERSION_DEFINITIONS.map(
  (definition) => {
    const contentHash = TEMPLATE_CONTENT_HASHES[`${definition.key}@${definition.version}`];
    if (!contentHash) throw new Error("TEMPLATE_VERSION_HASH_MISSING");
    return { ...definition, contentHash };
  },
);

export const COMMUNICATION_TEMPLATE_CATALOG = [
  { key: "security_password_recovery", activeVersion: "v1" },
  { key: "security_mfa_notice", activeVersion: "v1" },
  { key: "security_session_revoked", activeVersion: "v1" },
  { key: "crm_lead_welcome", activeVersion: "v1" },
  { key: "crm_followup_1", activeVersion: "v1" },
  { key: "contract_expiring", activeVersion: "v1" },
  { key: "pqr_received", activeVersion: "v1" },
  { key: "data_request_received", activeVersion: "v1" },
  { key: "security_password_changed", activeVersion: "v1" },
  { key: "security_account_invitation", activeVersion: "v1" },
  { key: "payment_result", activeVersion: "v1" },
  { key: "general_marketing", activeVersion: "v1" },
] as const satisfies readonly CommunicationTemplateCatalogEntry[];

export function computeCommunicationTemplateContentHash(
  template: CommunicationTemplateVersionDefinition,
): `sha256:${string}` {
  const canonical = JSON.stringify({
    key: template.key,
    version: template.version,
    channel: template.channel,
    kind: template.kind,
    subject: template.subject,
    requiredVariables: [...template.requiredVariables],
    textBody: template.body.text,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function resolveActiveCommunicationTemplate(key: string): CommunicationTemplateVersion {
  const pointer = COMMUNICATION_TEMPLATE_CATALOG.find((entry) => entry.key === key);
  if (!pointer) throw new Error("TEMPLATE_ACTIVE_POINTER_MISSING");
  const matches = COMMUNICATION_TEMPLATE_VERSIONS.filter(
    (version) => version.key === key && version.version === pointer.activeVersion,
  );
  const template = matches[0];
  if (matches.length !== 1 || !template) throw new Error("TEMPLATE_ACTIVE_VERSION_INVALID");
  if (computeCommunicationTemplateContentHash(template) !== template.contentHash) {
    throw new Error("TEMPLATE_CONTENT_HASH_MISMATCH");
  }
  return template;
}
