import { SelfServiceResourcePage } from "../../components/self-service";
import { selfServiceApi } from "../../lib/self-service";

const COMPANY = "Portal · Empresas";
const page = (resource: "benefits" | "contracts" | "payments" | "documents" | "requests" | "reports", title: string, description: string) => function CompanyResourcePage() {
  return <SelfServiceResourcePage queryKey={["self-service", "company", resource]} queryFn={(signal) => selfServiceApi.getRecords("company", resource, signal)} title={title} description={description} eyebrow={COMPANY} />;
};

export function CompanySummaryPage() { return <SelfServiceResourcePage queryKey={["self-service", "company", "summary"]} queryFn={(signal) => selfServiceApi.getSummary("company", signal)} title="Resumen empresarial" description="Consulta la información disponible para la empresa verificada." eyebrow={COMPANY} />; }
export const CompanyBenefitsPage = page("benefits", "Beneficios", "Consulta los beneficios habilitados para la relación empresarial.");
export const CompanyContractsPage = page("contracts", "Contratos", "Consulta las referencias contractuales entregadas por el proveedor.");
export const CompanyPaymentsPage = page("payments", "Pagos", "Revisa movimientos y pagos disponibles para la empresa.");
export const CompanyDocumentsPage = page("documents", "Documentos", "Consulta los documentos habilitados para la empresa.");
export const CompanyRequestsPage = page("requests", "Solicitudes", "Sigue las solicitudes empresariales registradas.");
export const CompanyReportsPage = page("reports", "Reportes", "Accede a los reportes autorizados para esta sesión.");
