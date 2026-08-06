export type PublicRouteGroup = "institutional" | "benefits" | "solutions" | "resources" | "transactional";

export interface PublicRouteDefinition {
  path: string;
  label: string;
  shortLabel?: string;
  description: string;
  group: PublicRouteGroup;
  primaryCta?: { label: string; to: string };
  seo: { title: string; description: string };
}

export const PUBLIC_ROUTES = {
  home: { path: "/", label: "Inicio", description: "Plataforma institucional de ASODEF.", group: "institutional", primaryCta: { label: "Comenzar", to: "/comenzar" }, seo: { title: "ASODEF | Beneficios y gestión para familias y organizaciones", description: "Conoce los beneficios, canales digitales y rutas de atención que ASODEF conecta para personas, afiliados, empresas y aliados." } },
  about: { path: "/quienes-somos", label: "Quiénes somos", description: "Identidad, propósito y operación institucional.", group: "institutional", seo: { title: "Quiénes somos | ASODEF", description: "Conoce el origen, propósito, principios, operación digital y datos empresariales verificados de ASODEF S.A.S." } },
  benefits: { path: "/beneficios", label: "Beneficios", description: "Portafolio verificado organizado por necesidad.", group: "benefits", primaryCta: { label: "Explorar beneficios", to: "/beneficios" }, seo: { title: "Beneficios para afiliados y familias | ASODEF", description: "Explora las categorías de beneficios que ASODEF articula para afiliados, beneficiarios y sus familias." } },
  solutions: { path: "/soluciones", label: "Soluciones", description: "Recorridos según tu relación con ASODEF.", group: "solutions", seo: { title: "Soluciones por perfil | ASODEF", description: "Encuentra la ruta de ASODEF para personas, afiliados, empresas y potenciales aliados." } },
  companies: { path: "/empresas", label: "Empresas", description: "Vinculación, gestión y acceso empresarial.", group: "solutions", seo: { title: "ASODEF para empresas", description: "Conoce los flujos de vinculación, gestión de relaciones y portal empresarial disponibles en ASODEF." } },
  resources: { path: "/recursos", label: "Recursos", description: "Orientación, pagos, solicitudes y documentos.", group: "resources", seo: { title: "Recursos y canales de atención | ASODEF", description: "Accede a preguntas frecuentes, pagos, contacto, PQR, solicitudes de datos y Centro Legal de ASODEF." } },
  faqs: { path: "/recursos/preguntas-frecuentes", label: "Preguntas frecuentes", description: "Respuestas sobre beneficios, pagos, portales y solicitudes.", group: "resources", seo: { title: "Preguntas frecuentes | ASODEF", description: "Resuelve dudas sobre beneficios, pagos, portales, PQR, datos personales y canales de ASODEF." } },
  contact: { path: "/contacto", label: "Contacto", description: "Orientación comercial e institucional con registro.", group: "resources", seo: { title: "Contacto | ASODEF", description: "Envía una solicitud de orientación a ASODEF con tratamiento de datos y preferencias de contacto explícitas." } },
  start: { path: "/comenzar", label: "Comenzar", description: "Orientador que dirige cada necesidad al canal correcto.", group: "transactional", seo: { title: "Encuentra tu ruta | ASODEF", description: "Responde unas preguntas breves y encuentra el canal, portal o proceso de ASODEF adecuado para tu necesidad." } },
  payments: { path: "/pagos", label: "Pagos", description: "Consulta segura de obligaciones y comprobantes.", group: "transactional", seo: { title: "Centro de pagos | ASODEF", description: "Consulta una obligación, revisa sus condiciones y continúa al pago autorizado por Bold en los canales de ASODEF." } },
  legal: { path: "/legal", label: "Centro Legal", description: "Documentos institucionales vigentes y trámites de datos.", group: "resources", seo: { title: "Centro Legal | ASODEF", description: "Consulta las políticas, autorizaciones, términos y procedimientos institucionales vigentes de ASODEF." } },
  pqr: { path: "/pqr", label: "PQR", description: "Radicación y consulta de peticiones, quejas o reclamos.", group: "resources", seo: { title: "PQR | ASODEF", description: "Radica y consulta peticiones, quejas, reclamos o sugerencias mediante el canal formal de ASODEF." } },
  dsr: { path: "/solicitudes-de-datos", label: "Solicitudes de datos", description: "Ejercicio de derechos sobre datos personales.", group: "resources", seo: { title: "Solicitudes de datos personales | ASODEF", description: "Presenta y consulta solicitudes relacionadas con el tratamiento de tus datos personales en ASODEF." } },
} as const satisfies Record<string, PublicRouteDefinition>;

export const PUBLIC_ROUTE_LIST = Object.values(PUBLIC_ROUTES);

export const LEGACY_REDIRECTS = [
  { from: "/portafolio", to: "/beneficios" },
  { from: "/cobertura", to: "/quienes-somos#operacion" },
  { from: "/legal/solicitudes-de-datos", to: "/solicitudes-de-datos" },
  { from: "/legal/pqr", to: "/pqr" },
] as const;

export const PUBLIC_NAV_GROUPS = [
  { label: "Conocer ASODEF", items: [PUBLIC_ROUTES.about, PUBLIC_ROUTES.benefits, PUBLIC_ROUTES.solutions, PUBLIC_ROUTES.companies] },
  { label: "Gestionar", items: [PUBLIC_ROUTES.payments, PUBLIC_ROUTES.pqr, PUBLIC_ROUTES.dsr] },
  { label: "Consultar", items: [PUBLIC_ROUTES.resources, PUBLIC_ROUTES.faqs, PUBLIC_ROUTES.contact, PUBLIC_ROUTES.legal] },
] as const;
