/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode } from "react";
import { selfServiceApi } from "./self-service-api";
import { SessionProvider, useRequiredSession, type SelfServiceSessionController } from "./session-context";
import type { CompanyAccessInput } from "./types";

export const CompanySelfServiceContext = createContext<SelfServiceSessionController<CompanyAccessInput> | null>(null);

export function CompanySelfServiceProvider({ children }: { children: ReactNode }) {
  return <SessionProvider context={CompanySelfServiceContext} startAccess={selfServiceApi.startCompanyAccess} requestChallenge={selfServiceApi.requestCompanyChallenge} resendChallenge={selfServiceApi.resendCompanyChallenge} verifyAccess={selfServiceApi.verifyCompanyAccess} getSession={selfServiceApi.getCompanySession} endSessionRequest={selfServiceApi.endCompanySession} storageKey="asodef:ss:company:csrf">{children}</SessionProvider>;
}

export function useCompanySelfService() {
  return useRequiredSession(CompanySelfServiceContext, "useCompanySelfService");
}
