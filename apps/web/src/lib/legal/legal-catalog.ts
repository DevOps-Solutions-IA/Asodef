export type LegalCategory = "Institucional" | "Privacidad y datos" | "Uso y portales" | "Pagos" | "Atención" | "Tecnología y acceso" | "Comunicaciones";

export interface LegalCatalogEntry {
  slug: string;
  title: string;
  description: string;
  category: LegalCategory;
  kind: "document" | "service";
}

export const LEGAL_CATALOG: readonly LegalCatalogEntry[] = [
  { slug: "informacion-empresarial", title: "Información empresarial", description: "Identidad, domicilio, registro y canales oficiales de ASODEF.", category: "Institucional", kind: "document" },
  { slug: "politica-de-privacidad", title: "Política de privacidad", description: "Cómo protegemos la privacidad al usar nuestros canales digitales.", category: "Privacidad y datos", kind: "document" },
  { slug: "tratamiento-de-datos", title: "Política de tratamiento de datos personales", description: "Reglas para recolectar, usar, conservar y proteger datos personales.", category: "Privacidad y datos", kind: "document" },
  { slug: "aviso-de-privacidad", title: "Aviso de privacidad", description: "Resumen del tratamiento y de los mecanismos para ejercer derechos.", category: "Privacidad y datos", kind: "document" },
  { slug: "autorizacion-general-de-tratamiento", title: "Autorización general de tratamiento", description: "Autorización informada para finalidades operativas de ASODEF.", category: "Privacidad y datos", kind: "document" },
  { slug: "tratamiento-datos-sensibles", title: "Tratamiento de datos sensibles", description: "Protección reforzada y carácter facultativo de información sensible.", category: "Privacidad y datos", kind: "document" },
  { slug: "tratamiento-menores-y-beneficiarios", title: "Tratamiento de menores y beneficiarios", description: "Reglas para reportar y proteger información de beneficiarios y menores.", category: "Privacidad y datos", kind: "document" },
  { slug: "terminos-y-condiciones", title: "Términos y condiciones de uso", description: "Reglas generales para acceder y utilizar la plataforma digital.", category: "Uso y portales", kind: "document" },
  { slug: "condiciones-portal-empresarial", title: "Condiciones del portal empresarial", description: "Acceso y responsabilidades de empresas y usuarios autorizados.", category: "Uso y portales", kind: "document" },
  { slug: "condiciones-portal-afiliado", title: "Condiciones del portal de usuario o afiliado", description: "Cuenta, consultas, pagos y consentimientos para afiliados.", category: "Uso y portales", kind: "document" },
  { slug: "terminos-de-pago", title: "Términos de pago", description: "Consulta, orden, resultado y comprobante de cada pago.", category: "Pagos", kind: "document" },
  { slug: "reversiones-y-reembolsos", title: "Reversiones, devoluciones y reembolsos", description: "Cómo solicitar y seguir una gestión asociada a un pago.", category: "Pagos", kind: "document" },
  { slug: "pqr", title: "Política y procedimiento de PQR", description: "Radicación y gestión de peticiones, quejas, reclamos y sugerencias.", category: "Atención", kind: "document" },
  { slug: "procedimiento-consultas-y-reclamos", title: "Consultas y reclamos de titulares", description: "Etapas para ejercer derechos sobre datos personales.", category: "Atención", kind: "document" },
  { slug: "politica-de-cookies", title: "Política de cookies", description: "Cookies esenciales y preferencias realmente usadas por la plataforma.", category: "Tecnología y acceso", kind: "document" },
  { slug: "seguridad", title: "Política de seguridad de la información", description: "Controles para proteger cuentas, operaciones, datos y evidencia.", category: "Tecnología y acceso", kind: "document" },
  { slug: "accesibilidad", title: "Declaración de accesibilidad", description: "Prácticas de teclado, lectura, contraste y adaptación responsive.", category: "Tecnología y acceso", kind: "document" },
  { slug: "consentimiento-whatsapp", title: "Consentimiento para WhatsApp", description: "Elección voluntaria para recibir mensajes por WhatsApp.", category: "Comunicaciones", kind: "document" },
  { slug: "consentimiento-correo-electronico", title: "Consentimiento para correo electrónico", description: "Reglas para comunicaciones enviadas al correo indicado.", category: "Comunicaciones", kind: "document" },
  { slug: "consentimiento-comunicaciones-comerciales", title: "Consentimiento de comunicaciones comerciales", description: "Autorización opcional para novedades, beneficios y campañas.", category: "Comunicaciones", kind: "document" },
  { slug: "politica-comunicaciones-electronicas", title: "Política de comunicaciones electrónicas", description: "Canales, evidencia, preferencias, supresión y revocación.", category: "Comunicaciones", kind: "document" },
  { slug: "solicitudes-de-datos", title: "Solicitudes de datos personales", description: "Radica o consulta una solicitud sobre tus datos personales.", category: "Atención", kind: "service" },
] as const;

export const LEGAL_DOCUMENT_CATALOG = LEGAL_CATALOG.filter((entry) => entry.kind === "document");
export const LEGAL_CATEGORIES: readonly LegalCategory[] = ["Institucional", "Privacidad y datos", "Uso y portales", "Pagos", "Atención", "Tecnología y acceso", "Comunicaciones"];
