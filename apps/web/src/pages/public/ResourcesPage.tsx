import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CircleHelp, CreditCard, FileCheck2, MessageSquareText, ShieldCheck } from "lucide-react";
import { EditorialSection, FaqList, PageCta, PublicHero, SectionIntro } from "../../components/public/PublicPage";
import { Seo } from "../../lib/seo/Seo";

export const PUBLIC_FAQS = [
  { question: "¿Dónde consulto una obligación o comprobante?", answer: "En el Centro de pagos. La consulta usa la referencia y validación requeridas; el proceso autorizado continúa con Bold cuando corresponde." },
  { question: "¿Cómo sé qué beneficio aplica a mi caso?", answer: "Explora el portafolio por audiencia y necesidad. La condición concreta siempre depende de la vinculación y de la información específica comunicada." },
  { question: "¿Puedo presentar una petición, queja o reclamo?", answer: "Sí. La ruta PQR permite radicar y luego consultar el caso mediante su referencia, sin convertir el formulario de contacto en un canal paralelo." },
  { question: "¿Cómo ejerzo derechos sobre mis datos personales?", answer: "Usa Solicitudes de datos personales para radicar una consulta o reclamo y conservar evidencia del trámite." },
  { question: "¿Enviar una solicitud empresarial crea una cuenta?", answer: "No. El envío crea un registro para seguimiento. El acceso a portales requiere el proceso de habilitación y los permisos correspondientes." },
  { question: "¿Puedo retirar una autorización comercial?", answer: "Sí. Las preferencias opcionales se conservan separadas de la autorización requerida y pueden gestionarse o revocarse por los canales disponibles." },
] as const;

const resources = [
  { icon: CircleHelp, title: "Preguntas frecuentes", text: "Respuestas sobre pagos, beneficios, portales y solicitudes.", to: "/recursos/preguntas-frecuentes" },
  { icon: CreditCard, title: "Centro de pagos", text: "Consulta obligaciones y conserva el acceso al comprobante.", to: "/pagos" },
  { icon: MessageSquareText, title: "PQR", text: "Radica y consulta una petición, queja, reclamo o sugerencia.", to: "/pqr" },
  { icon: FileCheck2, title: "Solicitudes de datos", text: "Ejerce derechos relacionados con tus datos personales.", to: "/solicitudes-de-datos" },
  { icon: ShieldCheck, title: "Centro Legal", text: "Consulta documentos vigentes, versiones y fechas de efectividad.", to: "/legal" },
  { icon: BookOpen, title: "Orientación", text: "Encuentra el canal adecuado mediante un recorrido breve.", to: "/comenzar" },
] as const;

export function ResourcesPage() { return <><Seo routeKey="resources" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Recursos", path: "/recursos" }]}/><PublicHero eyebrow="Recursos y canales" title={<>Información para actuar, no una biblioteca <span className="text-brand-orange">sin salida</span></>} description="Cada recurso explica una necesidad y conduce al flujo especializado que puede gestionarla." actions={[{ label: "Encontrar mi ruta", to: "/comenzar", primary: true }, { label: "Ver preguntas frecuentes", to: "/recursos/preguntas-frecuentes" }]}/><EditorialSection><SectionIntro eyebrow="Accesos directos" title="Elige el resultado que necesitas" description="Los canales no se duplican: orientación comercial, pagos, PQR y derechos de datos conservan sus procesos propios."/><div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{resources.map(({icon:Icon,...r})=><Link key={r.to} to={r.to} className="group rounded-3xl border border-brand-dark/10 bg-white p-7 shadow-e1 transition hover:-translate-y-1 hover:shadow-e3"><Icon className="h-7 w-7 text-brand-orange"/><h2 className="mt-7 font-display text-2xl font-semibold">{r.title}</h2><p className="mt-3 leading-7 text-text-muted">{r.text}</p><span className="mt-7 inline-flex items-center gap-2 font-semibold text-brand-dark">Abrir recurso<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1"/></span></Link>)}</div></EditorialSection><PageCta title="¿Tu necesidad combina varios temas?" description="El orientador identifica el primer canal correcto y evita recopilar información que corresponde a otro trámite."/></>; }

export function FaqPage() { return <><Seo routeKey="faqs" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Recursos", path: "/recursos" }, { name: "Preguntas frecuentes", path: "/recursos/preguntas-frecuentes" }]} faq={PUBLIC_FAQS}/><PublicHero eyebrow="Preguntas frecuentes" title="Respuestas precisas para elegir el siguiente paso" description="Información basada en las funciones disponibles y en las condiciones institucionales publicadas. No sustituye las condiciones específicas de una relación." actions={[{label:"Encontrar mi ruta",to:"/comenzar",primary:true},{label:"Centro Legal",to:"/legal"}]}/><EditorialSection><FaqList items={PUBLIC_FAQS}/></EditorialSection><PageCta title="Si tu pregunta requiere un caso, usa el canal formal" description="Te dirigimos a contacto, pagos, PQR o solicitudes de datos según la naturaleza de la gestión."/></>; }
