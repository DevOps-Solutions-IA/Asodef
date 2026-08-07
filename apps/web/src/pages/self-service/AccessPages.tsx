import { SelfServiceAccessGateway } from "../../components/self-service";
import { useAffiliateSelfService, useCompanySelfService } from "../../lib/self-service";

export function AffiliateAccessPage() {
  const controller = useAffiliateSelfService();
  return <SelfServiceAccessGateway scope="affiliate" controller={controller} makeInput={(identifier, options) => ({ identifier, identifierMode: options.identifierMode, documentType: options.documentType })} />;
}

export function CompanyAccessPage() {
  const controller = useCompanySelfService();
  return <SelfServiceAccessGateway scope="company" controller={controller} makeInput={(nit) => ({ nit })} />;
}
