/**
 * Confirmed ASODEF corporate facts only. Do not add fields here (legal
 * representative, exact registered address, judicial notification email,
 * prices, guarantees) unless the value has been explicitly confirmed —
 * see PRD rule on never inventing unverified legal/commercial facts.
 */
export const ASODEF_COMPANY = {
  legalName: "ASODEF S.A.S.",
  tagline: "Trabajamos pensando en su bienestar.",
  corporateEmail: "info@asodef.com.co",
  city: "Cali",
  country: "Colombia",
  commercialContact: {
    fullName: "Juan Pablo Filigrana",
    role: "Director Comercial",
    whatsapp: "3232733927",
    whatsappUrl: "https://wa.me/573232733927",
  },
} as const;
