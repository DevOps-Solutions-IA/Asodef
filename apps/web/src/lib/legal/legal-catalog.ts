/**
 * US-045: the single source of truth for the 12 known /legal/* subpage
 * slugs+titles (the PRD's own routes array, ".agents/tasks/prd-asodef-phase1.json"
 * lines 16-27). Router, LegalLayout's nav, and the Legal Center index/search
 * all import from here instead of keeping their own copies.
 */
export interface LegalCatalogEntry {
  slug: string;
  title: string;
}

export const LEGAL_CATALOG: readonly LegalCatalogEntry[] = [
  { slug: "informacion-empresarial", title: "Información empresarial" },
  { slug: "politica-de-privacidad", title: "Política de privacidad" },
  { slug: "tratamiento-de-datos", title: "Tratamiento de datos" },
  { slug: "aviso-de-privacidad", title: "Aviso de privacidad" },
  { slug: "terminos-y-condiciones", title: "Términos y condiciones" },
  { slug: "terminos-de-pago", title: "Términos de pago" },
  { slug: "reversiones-y-reembolsos", title: "Reversiones y reembolsos" },
  { slug: "politica-de-cookies", title: "Política de cookies" },
  { slug: "pqr", title: "PQR" },
  { slug: "seguridad", title: "Seguridad" },
  { slug: "accesibilidad", title: "Accesibilidad" },
  { slug: "solicitudes-de-datos", title: "Solicitudes de datos" },
] as const;
