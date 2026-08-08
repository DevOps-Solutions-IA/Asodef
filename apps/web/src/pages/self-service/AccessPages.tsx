import { SelfServiceAccessGateway } from "../../components/self-service";
import { useAffiliateSelfService, useCompanySelfService } from "../../lib/self-service";

export function AffiliateAccessPage() {
  const controller = useAffiliateSelfService();
  return <SelfServiceAccessGateway scope="affiliate" controller={controller} makeInput={(identifier) => ({ identifier, identifierMode: "DOCUMENT" as const, documentType: "CC" as const })} />;
}

export function CompanyAccessPage() {
  const controller = useCompanySelfService();
  return <SelfServiceAccessGateway scope="company" controller={controller} makeInput={(nit) => ({ nit })} />;
}
