/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode } from "react";
import { selfServiceApi } from "./self-service-api";
import { SessionProvider, useRequiredSession, type SelfServiceSessionController } from "./session-context";
import type { AffiliateAccessInput } from "./types";

export const AffiliateSelfServiceContext = createContext<SelfServiceSessionController<AffiliateAccessInput> | null>(null);

export function AffiliateSelfServiceProvider({ children }: { children: ReactNode }) {
  return <SessionProvider context={AffiliateSelfServiceContext} startAccess={selfServiceApi.startAffiliateAccess} requestChallenge={selfServiceApi.requestAffiliateChallenge} resendChallenge={selfServiceApi.resendAffiliateChallenge} verifyAccess={selfServiceApi.verifyAffiliateAccess} getSession={selfServiceApi.getAffiliateSession} endSessionRequest={selfServiceApi.endAffiliateSession} storageKey="asodef:ss:affiliate:csrf">{children}</SessionProvider>;
}

export function useAffiliateSelfService() {
  return useRequiredSession(AffiliateSelfServiceContext, "useAffiliateSelfService");
}
