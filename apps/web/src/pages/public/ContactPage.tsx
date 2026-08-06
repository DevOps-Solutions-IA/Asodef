import { PublicHero } from "../../components/public/PublicPage";
import { Seo } from "../../lib/seo/Seo";
import { ContactSection } from "../home/ContactSection";

export function ContactPage() {
  return <><Seo routeKey="contact" breadcrumbs={[{ name: "Inicio", path: "/" }, { name: "Contacto", path: "/contacto" }]}/><PublicHero eyebrow="Contacto institucional" title="Una solicitud registrada para una orientación concreta" description="Este canal crea seguimiento para consultas institucionales o comerciales. Para pagos, PQR o derechos de datos, usa el proceso especializado correspondiente." actions={[{label:"Usar el orientador",to:"/comenzar",primary:true},{label:"Ver recursos",to:"/recursos"}]}/><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"><ContactSection eyebrow="Solicitud de contacto" heading="Cuéntanos el contexto de tu necesidad" description="Completa los datos del formulario. La autorización de tratamiento es requerida; las comunicaciones comerciales son opcionales."/></div></>;
}
