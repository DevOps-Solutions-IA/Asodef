/**
 * US-059: not literally required by the story's own AC (which never
 * asks for admin template management), but NotificationService.send()
 * needs at least one real TRANSACTIONAL and one real MARKETING
 * template to be exercisable at all. Matches the AC's own named
 * example ("a transactional template (e.g. payment result)") exactly.
 */
export interface CommunicationTemplateCatalogEntry {
  key: string;
  channel: string;
  kind: "TRANSACTIONAL" | "MARKETING";
  subject: string | null;
  body: Record<string, unknown>;
}

export const COMMUNICATION_TEMPLATE_CATALOG: readonly CommunicationTemplateCatalogEntry[] = [
  {
    key: "payment_result",
    channel: "email",
    kind: "TRANSACTIONAL",
    subject: "Resultado de tu pago - ASODEF",
    body: { text: "Te informamos el resultado de tu pago." },
  },
  {
    key: "general_marketing",
    channel: "email",
    kind: "MARKETING",
    subject: "Novedades de ASODEF",
    body: { text: "Conoce las últimas novedades de ASODEF." },
  },
] as const;
